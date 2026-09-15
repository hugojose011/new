import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import type { Credentials, OAuth2Client } from 'google-auth-library';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../../config/configuration';
import { EncryptionService } from '../../crypto/encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CalendarCredentials } from '../calendar-provider';
import { ERROR_CODES, IntegrationUnavailableException } from '../../common/errors';

/**
 * Escopos solicitados — princípio de menor privilégio (§8).
 *
 * calendar.readonly    -> listar as agendas do usuário e consultar free/busy
 * calendar.events      -> criar/alterar/cancelar apenas eventos (não a agenda)
 *
 * Deliberadamente NÃO pedimos `https://www.googleapis.com/auth/calendar`
 * (acesso total), nem escopos de perfil além de e-mail/openid, que servem
 * apenas para exibir qual conta está conectada.
 */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

interface StatePayload {
  userId: string;
  nonce: string;
  issuedAt: number;
}

const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly encryption: EncryptionService,
    private readonly prisma: PrismaService,
  ) {}

  get isConfigured(): boolean {
    return this.config.google.configured;
  }

  private assertConfigured(): void {
    if (!this.isConfigured) {
      throw new IntegrationUnavailableException(
        ERROR_CODES.GOOGLE_UNAVAILABLE,
        'A integração com o Google não está configurada neste ambiente.',
      );
    }
  }

  /** Cliente "vazio", usado apenas para o fluxo de autorização. */
  createClient(): OAuth2Client {
    this.assertConfigured();
    return new google.auth.OAuth2(
      this.config.google.clientId,
      this.config.google.clientSecret,
      this.config.google.redirectUri,
    );
  }

  /**
   * State assinado (HMAC) com nonce e timestamp: protege contra CSRF no
   * callback e impede que o callback de um usuário seja replayed para outro.
   */
  buildState(userId: string): string {
    const payload: StatePayload = {
      userId,
      nonce: randomBytes(16).toString('base64url'),
      issuedAt: Date.now(),
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.signState(body)}`;
  }

  parseState(state: string): StatePayload {
    const [body, signature] = state.split('.');
    if (!body || !signature) throw new BadRequestException('Parâmetro state inválido.');

    const expected = this.signState(body);
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new BadRequestException('Parâmetro state com assinatura inválida.');
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
    if (Date.now() - payload.issuedAt > STATE_TTL_MS) {
      throw new BadRequestException('Autorização expirada. Tente conectar novamente.');
    }
    return payload;
  }

  private signState(body: string): string {
    return createHmac('sha256', this.config.jwtSecret).update(body).digest('base64url');
  }

  buildAuthUrl(userId: string): string {
    const client = this.createClient();
    return client.generateAuthUrl({
      access_type: 'offline', // necessário para obter refresh token (§7)
      prompt: 'consent', // garante refresh token mesmo em reconexões
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
      state: this.buildState(userId),
    });
  }

  /**
   * Devolve um cliente autenticado para o host, renovando o access token
   * quando necessário. Os tokens são decriptados apenas em memória e nunca
   * saem do backend (§7).
   */
  async getAuthorizedClient(credentials: CalendarCredentials): Promise<OAuth2Client> {
    this.assertConfigured();

    const connection = await this.prisma.calendarConnection.findUnique({
      where: { id: credentials.connectionId },
    });
    if (!connection || !connection.encryptedRefreshToken) {
      throw new IntegrationUnavailableException(
        ERROR_CODES.GOOGLE_NOT_CONNECTED,
        'Conecte sua conta do Google Agenda para continuar.',
      );
    }
    if (connection.status === 'REAUTH_REQUIRED' || connection.status === 'DISCONNECTED') {
      throw new IntegrationUnavailableException(
        ERROR_CODES.GOOGLE_REAUTH_REQUIRED,
        'Sua conexão com o Google Agenda precisa ser renovada.',
      );
    }

    const client = this.createClient();
    client.setCredentials({
      refresh_token: this.encryption.decrypt(connection.encryptedRefreshToken),
      access_token: connection.encryptedAccessToken
        ? this.encryption.decrypt(connection.encryptedAccessToken)
        : undefined,
      expiry_date: connection.tokenExpiresAt?.getTime(),
    });

    // Persiste silenciosamente os tokens renovados pela própria biblioteca.
    client.on('tokens', (tokens: Credentials) => {
      void this.persistRefreshedTokens(connection.id, tokens).catch((error) =>
        this.logger.warn(`Falha ao persistir tokens renovados: ${(error as Error).message}`),
      );
    });

    return client;
  }

  private async persistRefreshedTokens(
    connectionId: string,
    tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null },
  ): Promise<void> {
    await this.prisma.calendarConnection.update({
      where: { id: connectionId },
      data: {
        ...(tokens.access_token
          ? { encryptedAccessToken: this.encryption.encrypt(tokens.access_token) }
          : {}),
        ...(tokens.refresh_token
          ? { encryptedRefreshToken: this.encryption.encrypt(tokens.refresh_token) }
          : {}),
        ...(tokens.expiry_date ? { tokenExpiresAt: new Date(tokens.expiry_date) } : {}),
        status: 'CONNECTED',
      },
    });
  }

  /** Marca a conexão como necessitando nova autorização (token revogado). */
  async markReauthRequired(connectionId: string): Promise<void> {
    await this.prisma.calendarConnection.update({
      where: { id: connectionId },
      data: { status: 'REAUTH_REQUIRED' },
    });
  }
}
