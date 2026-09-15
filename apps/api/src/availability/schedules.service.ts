import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDto, OverrideDto, RuleDto, UpdateScheduleDto } from './dto/schedule.dto';
import { AvailabilityScheduleDto } from '@agenda/shared';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<AvailabilityScheduleDto[]> {
    const schedules = await this.prisma.availabilitySchedule.findMany({
      where: { userId },
      include: { rules: true, overrides: { include: { intervals: true } } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return schedules.map((schedule) => this.serialize(schedule));
  }

  /** Busca garantindo ownership: o id da URL nunca basta por si só (§75). */
  async findOwned(userId: string, id: string) {
    const schedule = await this.prisma.availabilitySchedule.findFirst({
      where: { id, userId },
      include: { rules: true, overrides: { include: { intervals: true } } },
    });
    if (!schedule) throw new NotFoundException('Agenda de disponibilidade não encontrada.');
    return schedule;
  }

  async get(userId: string, id: string): Promise<AvailabilityScheduleDto> {
    return this.serialize(await this.findOwned(userId, id));
  }

  async create(userId: string, dto: CreateScheduleDto): Promise<AvailabilityScheduleDto> {
    this.validateRules(dto.rules ?? []);
    this.validateOverrides(dto.overrides ?? []);

    const isFirst = (await this.prisma.availabilitySchedule.count({ where: { userId } })) === 0;
    const shouldBeDefault = dto.isDefault || isFirst;

    const schedule = await this.prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.availabilitySchedule.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.availabilitySchedule.create({
        data: {
          userId,
          name: dto.name,
          timezone: dto.timezone,
          isDefault: shouldBeDefault,
          rules: { create: dto.rules ?? [] },
        },
      });

      await this.replaceOverrides(tx, created.id, dto.overrides ?? []);
      return created;
    });

    return this.get(userId, schedule.id);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateScheduleDto,
  ): Promise<AvailabilityScheduleDto> {
    await this.findOwned(userId, id);
    if (dto.rules) this.validateRules(dto.rules);
    if (dto.overrides) this.validateOverrides(dto.overrides);

    await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.availabilitySchedule.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      await tx.availabilitySchedule.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.timezone ? { timezone: dto.timezone } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });

      if (dto.rules) {
        await tx.availabilityRule.deleteMany({ where: { scheduleId: id } });
        if (dto.rules.length > 0) {
          await tx.availabilityRule.createMany({
            data: dto.rules.map((rule) => ({ ...rule, scheduleId: id })),
          });
        }
      }

      if (dto.overrides) {
        await this.replaceOverrides(tx, id, dto.overrides);
      }
    });

    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const schedule = await this.findOwned(userId, id);

    const inUse = await this.prisma.eventType.count({
      where: { scheduleId: id, deletedAt: null },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        'Esta agenda está sendo usada por tipos de evento. Troque a agenda deles antes de excluir.',
      );
    }
    const total = await this.prisma.availabilitySchedule.count({ where: { userId } });
    if (total <= 1) {
      throw new BadRequestException('É necessário manter ao menos uma agenda de disponibilidade.');
    }

    await this.prisma.availabilitySchedule.delete({ where: { id: schedule.id } });

    if (schedule.isDefault) {
      const next = await this.prisma.availabilitySchedule.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await this.prisma.availabilitySchedule.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  }

  async getDefault(userId: string) {
    return (
      (await this.prisma.availabilitySchedule.findFirst({
        where: { userId, isDefault: true },
      })) ??
      (await this.prisma.availabilitySchedule.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }))
    );
  }

  // -------------------------------------------------------------------------

  private async replaceOverrides(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    scheduleId: string,
    overrides: OverrideDto[],
  ): Promise<void> {
    await tx.availabilityOverride.deleteMany({ where: { scheduleId } });
    for (const override of overrides) {
      await tx.availabilityOverride.create({
        data: {
          scheduleId,
          // Datas são armazenadas como DATE pura: o dia não depende de fuso.
          date: new Date(`${override.date}T00:00:00.000Z`),
          type: override.type,
          note: override.note ?? null,
          intervals:
            override.type === 'CUSTOM_HOURS'
              ? {
                  create: override.intervals.map((interval) => ({
                    startMinute: interval.startMinute,
                    endMinute: interval.endMinute,
                  })),
                }
              : undefined,
        },
      });
    }
  }

  private validateRules(rules: RuleDto[]): void {
    for (const rule of rules) {
      if (rule.startMinute >= rule.endMinute) {
        throw new BadRequestException(
          'O horário inicial precisa ser anterior ao final em todos os intervalos.',
        );
      }
    }
    // Sobreposição no mesmo dia é aceita e normalizada pelo engine, mas
    // intervalos idênticos indicam erro de interface.
    const seen = new Set<string>();
    for (const rule of rules) {
      const key = `${rule.weekday}-${rule.startMinute}-${rule.endMinute}`;
      if (seen.has(key)) {
        throw new BadRequestException('Existem intervalos duplicados na mesma data.');
      }
      seen.add(key);
    }
  }

  private validateOverrides(overrides: OverrideDto[]): void {
    const seen = new Set<string>();
    for (const override of overrides) {
      if (!DateTime.fromISO(override.date).isValid) {
        throw new BadRequestException(`Data de exceção inválida: ${override.date}`);
      }
      if (seen.has(override.date)) {
        throw new BadRequestException(`Existe mais de uma exceção para ${override.date}.`);
      }
      seen.add(override.date);

      if (override.type === 'CUSTOM_HOURS' && override.intervals.length === 0) {
        throw new BadRequestException(
          'Uma exceção com horário personalizado precisa de ao menos um intervalo.',
        );
      }
      for (const interval of override.intervals) {
        if (interval.startMinute >= interval.endMinute) {
          throw new BadRequestException('Intervalo de exceção inválido.');
        }
      }
    }
  }

  private serialize(schedule: {
    id: string;
    name: string;
    timezone: string;
    isDefault: boolean;
    rules: { weekday: number; startMinute: number; endMinute: number }[];
    overrides: {
      id: string;
      date: Date;
      type: 'UNAVAILABLE' | 'CUSTOM_HOURS';
      intervals: { startMinute: number; endMinute: number }[];
    }[];
  }): AvailabilityScheduleDto {
    return {
      id: schedule.id,
      name: schedule.name,
      timezone: schedule.timezone,
      isDefault: schedule.isDefault,
      rules: schedule.rules
        .map((rule) => ({
          weekday: rule.weekday,
          startMinute: rule.startMinute,
          endMinute: rule.endMinute,
        }))
        .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute),
      overrides: schedule.overrides
        .map((override) => ({
          id: override.id,
          date: DateTime.fromJSDate(override.date, { zone: 'utc' }).toISODate() as string,
          type: override.type,
          intervals: override.intervals.map((interval) => ({
            startMinute: interval.startMinute,
            endMinute: interval.endMinute,
          })),
        }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    };
  }
}
