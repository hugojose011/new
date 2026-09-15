import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { SessionPayload } from './auth.constants';
import { RegisterDto } from './dto/auth.dto';
import { AuditService } from '../audit/audit.service';

/**
 * Argon2id com parâmetros acima do mínimo recomendado pela OWASP
 * (19 MiB de memória, 2 iterações).
 */
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Já existe uma conta com este e-mail.');
    }

    const passwordHash = await argon2.hash(dto.password, ARGON_OPTIONS);

    // Todo usuário nasce dentro de um workspace, mesmo sendo o único membro:
    // é o que permite evoluir para equipes sem migração de dados (§5).
    const user = await this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({ data: { name: dto.name } });
      const created = await tx.user.create({
        data: {
          workspaceId: workspace.id,
          name: dto.name,
          email: dto.email,
          passwordHash,
          timezone: dto.timezone ?? 'America/Sao_Paulo',
          memberships: { create: { workspaceId: workspace.id, role: 'OWNER' } },
        },
      });

      // Um schedule padrão evita que o usuário fique sem disponibilidade
      // configurável logo após o cadastro.
      await tx.availabilitySchedule.create({
        data: {
          userId: created.id,
          name: 'Horário padrão',
          timezone: created.timezone,
          isDefault: true,
          rules: {
            create: [1, 2, 3, 4, 5].map((weekday) => ({
              weekday,
              startMinute: 9 * 60,
              endMinute: 18 * 60,
            })),
          },
        },
      });

      return created;
    });

    await this.audit.record({
      userId: user.id,
      workspaceId: user.workspaceId,
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user.id,
    });

    return user;
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Executa o verify mesmo sem usuário para manter o tempo de resposta
    // constante e não vazar quais e-mails existem.
    const hash = user?.passwordHash ?? (await this.dummyHash());
    const valid = await argon2.verify(hash, password).catch(() => false);

    if (!user || !valid) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }
    return user;
  }

  async issueSession(user: { id: string; workspaceId: string; email: string }): Promise<string> {
    const payload: SessionPayload = { sub: user.id, wid: user.workspaceId, email: user.email };
    return this.jwt.signAsync(payload, { expiresIn: `${this.config.sessionTtlMinutes}m` });
  }

  private dummyHashCache: string | null = null;
  private async dummyHash(): Promise<string> {
    if (!this.dummyHashCache) {
      this.dummyHashCache = await argon2.hash('senha-inexistente', ARGON_OPTIONS);
    }
    return this.dummyHashCache;
  }
}
