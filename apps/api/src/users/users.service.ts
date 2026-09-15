import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { USERNAME_PATTERN } from '@agenda/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from '../auth/dto/auth.dto';
import { AuditService } from '../audit/audit.service';

/** Usernames que colidem com rotas da aplicação. */
const RESERVED_USERNAMES = new Set([
  'api',
  'app',
  'admin',
  'agendamento',
  'agendamentos',
  'auth',
  'bookings',
  'configuracoes',
  'dashboard',
  'disponibilidade',
  'entrar',
  'event-types',
  'integracoes',
  'login',
  'onboarding',
  'public',
  'settings',
  'signup',
  'tipos-de-evento',
]);

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      timezone: user.timezone,
      locale: user.locale,
      onboardingDone: user.onboardingDone,
      onboardingStep: user.onboardingStep,
      workspaceId: user.workspaceId,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.username) {
      await this.assertUsernameAvailable(dto.username, userId);
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.username ? { username: dto.username } : {}),
        ...(dto.timezone ? { timezone: dto.timezone } : {}),
        ...(dto.locale ? { locale: dto.locale } : {}),
      },
    });

    // O timezone do perfil também guia a agenda padrão, evitando que o host
    // configure 09h-18h e veja outra coisa na página pública.
    if (dto.timezone) {
      await this.prisma.availabilitySchedule.updateMany({
        where: { userId, isDefault: true },
        data: { timezone: dto.timezone },
      });
    }

    await this.audit.record({ userId, action: 'PROFILE_UPDATED' });
    return this.getProfile(user.id);
  }

  async isUsernameAvailable(username: string, userId?: string): Promise<boolean> {
    if (!USERNAME_PATTERN.test(username) || RESERVED_USERNAMES.has(username)) return false;
    const existing = await this.prisma.user.findUnique({ where: { username } });
    return !existing || existing.id === userId;
  }

  async assertUsernameAvailable(username: string, userId?: string): Promise<void> {
    if (!USERNAME_PATTERN.test(username)) {
      throw new BadRequestException('Username inválido.');
    }
    if (RESERVED_USERNAMES.has(username)) {
      throw new ConflictException('Este username é reservado. Escolha outro.');
    }
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing && existing.id !== userId) {
      throw new ConflictException('Este username já está em uso.');
    }
  }

  async completeOnboardingStep(userId: string, step: number) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        onboardingStep: step,
        onboardingDone: step >= 4,
      },
    });
    return this.getProfile(user.id);
  }
}
