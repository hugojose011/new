import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../crypto/encryption.service';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleCalendarProvider } from './google-calendar.provider';
import { AuditService } from '../../audit/audit.service';
import { CalendarConnectionDto } from '@agenda/shared';
import { ERROR_CODES, IntegrationUnavailableException } from '../../common/errors';

@Injectable()
export class GoogleIntegrationService {
  private readonly logger = new Logger(GoogleIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly oauth: GoogleOAuthService,
    private readonly provider: GoogleCalendarProvider,
    private readonly audit: AuditService,
  ) {}

  buildAuthUrl(userId: string): string {
    return this.oauth.buildAuthUrl(userId);
  }

  /**
   * Troca o código pelo par de tokens e persiste a conexão.
   * O refresh token é gravado criptografado; nada volta para o frontend (§7).
   */
  async handleCallback(code: string, state: string): Promise<{ userId: string }> {
    const { userId } = this.oauth.parseState(state);

    const client = this.oauth.createClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      // Sem refresh token o servidor não consegue agir com o usuário offline.
      throw new BadRequestException(
        'O Google não devolveu um refresh token. Remova o acesso do app na sua Conta Google e conecte novamente.',
      );
    }

    client.setCredentials(tokens);
    const userInfo = await client
      .request<{ email?: string; sub?: string }>({
        url: 'https://openidconnect.googleapis.com/v1/userinfo',
      })
      .then((response: { data: { email?: string; sub?: string } }) => response.data)
      .catch(() => ({ email: undefined, sub: undefined }));

    const providerAccountId = userInfo.sub ?? userInfo.email ?? 'unknown';

    const connection = await this.prisma.calendarConnection.upsert({
      where: {
        userId_provider_providerAccountId: {
          userId,
          provider: 'GOOGLE',
          providerAccountId,
        },
      },
      create: {
        userId,
        provider: 'GOOGLE',
        providerAccountId,
        accountEmail: userInfo.email ?? null,
        encryptedAccessToken: tokens.access_token
          ? this.encryption.encrypt(tokens.access_token)
          : null,
        encryptedRefreshToken: this.encryption.encrypt(tokens.refresh_token),
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes: (tokens.scope ?? '').split(' ').filter(Boolean),
        status: 'CONNECTED',
      },
      update: {
        accountEmail: userInfo.email ?? null,
        encryptedAccessToken: tokens.access_token
          ? this.encryption.encrypt(tokens.access_token)
          : null,
        encryptedRefreshToken: this.encryption.encrypt(tokens.refresh_token),
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes: (tokens.scope ?? '').split(' ').filter(Boolean),
        status: 'CONNECTED',
      },
    });

    await this.syncCalendars(userId, connection.id);
    await this.audit.record({
      userId,
      action: 'GOOGLE_CONNECTED',
      entityType: 'CalendarConnection',
      entityId: connection.id,
    });

    return { userId };
  }

  /** Importa/atualiza a lista de agendas da conta conectada. */
  async syncCalendars(userId: string, connectionId: string): Promise<void> {
    const calendars = await this.provider.listCalendars({ connectionId, userId });

    const existing = await this.prisma.connectedCalendar.findMany({
      where: { calendarConnectionId: connectionId },
    });
    const hasDestination = existing.some((calendar) => calendar.isBookingDestination);

    for (const calendar of calendars) {
      const previous = existing.find((item) => item.providerCalendarId === calendar.id);
      // Só agendas em que o usuário pode escrever servem como destino.
      const writable = calendar.accessRole === 'owner' || calendar.accessRole === 'writer';

      await this.prisma.connectedCalendar.upsert({
        where: {
          calendarConnectionId_providerCalendarId: {
            calendarConnectionId: connectionId,
            providerCalendarId: calendar.id,
          },
        },
        create: {
          calendarConnectionId: connectionId,
          providerCalendarId: calendar.id,
          name: calendar.name,
          isPrimary: calendar.isPrimary,
          accessRole: calendar.accessRole,
          timezone: calendar.timezone,
          // Padrão sensato: a agenda principal verifica conflitos e recebe
          // os novos eventos, e o usuário ajusta depois.
          checkConflicts: calendar.isPrimary,
          isBookingDestination: calendar.isPrimary && writable && !hasDestination,
        },
        update: {
          name: calendar.name,
          isPrimary: calendar.isPrimary,
          accessRole: calendar.accessRole,
          timezone: calendar.timezone,
          ...(previous ? {} : { checkConflicts: calendar.isPrimary }),
        },
      });
    }

    // Agendas removidas no Google deixam de existir aqui também.
    const currentIds = calendars.map((calendar) => calendar.id);
    await this.prisma.connectedCalendar.deleteMany({
      where: {
        calendarConnectionId: connectionId,
        providerCalendarId: { notIn: currentIds.length > 0 ? currentIds : ['__none__'] },
      },
    });

    await this.prisma.calendarConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: new Date() },
    });
  }

  async getConnection(userId: string): Promise<CalendarConnectionDto> {
    const connection = await this.prisma.calendarConnection.findFirst({
      where: { userId },
      include: { calendars: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!connection) {
      return { connected: false, status: null, accountEmail: null, lastSyncedAt: null, calendars: [] };
    }

    return {
      connected: connection.status === 'CONNECTED',
      status: connection.status,
      accountEmail: connection.accountEmail,
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
      calendars: connection.calendars.map((calendar) => ({
        id: calendar.id,
        providerCalendarId: calendar.providerCalendarId,
        name: calendar.name,
        isPrimary: calendar.isPrimary,
        checkConflicts: calendar.checkConflicts,
        isBookingDestination: calendar.isBookingDestination,
        accessRole: calendar.accessRole,
        timezone: calendar.timezone,
      })),
    };
  }

  /** Atualiza quais agendas checam conflito e qual recebe os eventos. */
  async updateCalendarPreferences(
    userId: string,
    input: { conflictCalendarIds: string[]; destinationCalendarId: string | null },
  ): Promise<CalendarConnectionDto> {
    const connection = await this.prisma.calendarConnection.findFirst({
      where: { userId },
      include: { calendars: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!connection) throw new NotFoundException('Nenhuma conta Google conectada.');

    const owned = new Set(connection.calendars.map((calendar) => calendar.id));
    for (const id of input.conflictCalendarIds) {
      if (!owned.has(id)) throw new BadRequestException('Agenda inválida para esta conexão.');
    }
    if (input.destinationCalendarId && !owned.has(input.destinationCalendarId)) {
      throw new BadRequestException('Agenda de destino inválida para esta conexão.');
    }

    const destination = connection.calendars.find(
      (calendar) => calendar.id === input.destinationCalendarId,
    );
    if (destination && !['owner', 'writer'].includes(destination.accessRole ?? '')) {
      throw new BadRequestException(
        'A agenda escolhida como destino não permite criação de eventos.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.connectedCalendar.updateMany({
        where: { calendarConnectionId: connection.id },
        data: { checkConflicts: false, isBookingDestination: false },
      }),
      this.prisma.connectedCalendar.updateMany({
        where: { calendarConnectionId: connection.id, id: { in: input.conflictCalendarIds } },
        data: { checkConflicts: true },
      }),
      ...(input.destinationCalendarId
        ? [
            this.prisma.connectedCalendar.update({
              where: { id: input.destinationCalendarId },
              data: { isBookingDestination: true },
            }),
          ]
        : []),
    ]);

    await this.audit.record({
      userId,
      action: 'GOOGLE_CALENDARS_UPDATED',
      entityType: 'CalendarConnection',
      entityId: connection.id,
    });

    return this.getConnection(userId);
  }

  /** Desconecta: revoga no Google (best effort) e apaga os tokens locais (§58). */
  async disconnect(userId: string): Promise<void> {
    const connection = await this.prisma.calendarConnection.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!connection) return;

    if (connection.encryptedRefreshToken && this.oauth.isConfigured) {
      try {
        const client = this.oauth.createClient();
        await client.revokeToken(this.encryption.decrypt(connection.encryptedRefreshToken));
      } catch (error) {
        this.logger.warn(`Falha ao revogar token no Google: ${(error as Error).message}`);
      }
    }

    await this.prisma.calendarConnection.delete({ where: { id: connection.id } });
    await this.audit.record({
      userId,
      action: 'GOOGLE_DISCONNECTED',
      entityType: 'CalendarConnection',
      entityId: connection.id,
    });
  }

  /**
   * Conexão utilizável para operações de escrita (criar evento).
   * Lança erro claro quando não há agenda de destino configurada (§83).
   */
  async requireDestination(userId: string): Promise<{
    connectionId: string;
    calendarId: string;
  }> {
    const connection = await this.prisma.calendarConnection.findFirst({
      where: { userId, status: 'CONNECTED' },
      include: { calendars: { where: { isBookingDestination: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (!connection) {
      throw new IntegrationUnavailableException(
        ERROR_CODES.GOOGLE_NOT_CONNECTED,
        'A agenda do Google não está conectada para este host.',
      );
    }
    const destination = connection.calendars[0];
    if (!destination) {
      throw new IntegrationUnavailableException(
        ERROR_CODES.GOOGLE_NOT_CONNECTED,
        'Nenhuma agenda de destino foi definida para receber os agendamentos.',
      );
    }

    return { connectionId: connection.id, calendarId: destination.providerCalendarId };
  }
}
