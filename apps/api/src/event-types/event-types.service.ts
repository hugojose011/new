import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { slugify } from '@agenda/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventTypeDto, UpdateEventTypeDto } from './dto/event-type.dto';
import { SchedulesService } from '../availability/schedules.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class EventTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: SchedulesService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string) {
    return this.prisma.eventType.findMany({
      where: { hostUserId: userId, deletedAt: null },
      include: { questions: { orderBy: { order: 'asc' } }, _count: { select: { bookings: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(userId: string, id: string) {
    const eventType = await this.prisma.eventType.findFirst({
      where: { id, hostUserId: userId, deletedAt: null },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!eventType) throw new NotFoundException('Tipo de evento não encontrado.');
    return eventType;
  }

  async create(userId: string, workspaceId: string, dto: CreateEventTypeDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const scheduleId = await this.resolveScheduleId(userId, dto.scheduleId);
    const slug = await this.resolveSlug(userId, dto.slug ?? slugify(dto.name));

    this.validateLocation(dto.locationType, dto.locationValue ?? null);

    const eventType = await this.prisma.eventType.create({
      data: {
        workspaceId,
        hostUserId: userId,
        scheduleId,
        name: dto.name,
        slug,
        description: dto.description ?? null,
        kind: dto.kind ?? 'ONE_TO_ONE',
        durationMinutes: dto.durationMinutes,
        slotIntervalMinutes: dto.slotIntervalMinutes ?? dto.durationMinutes,
        locationType: dto.locationType,
        locationValue: dto.locationValue ?? null,
        bufferBeforeMinutes: dto.bufferBeforeMinutes ?? 0,
        bufferAfterMinutes: dto.bufferAfterMinutes ?? 0,
        minimumNoticeMinutes: dto.minimumNoticeMinutes ?? 120,
        bookingWindowDays: dto.bookingWindowDays ?? 30,
        maxBookingsPerDay: dto.maxBookingsPerDay ?? null,
        minimumCancellationNoticeMinutes: dto.minimumCancellationNoticeMinutes ?? 0,
        minimumRescheduleNoticeMinutes: dto.minimumRescheduleNoticeMinutes ?? 0,
        timezone: dto.timezone ?? user.timezone,
        isActive: dto.isActive ?? true,
        questions: {
          create: (dto.questions ?? []).map((question) => ({
            label: question.label,
            type: question.type,
            required: question.required,
            options: question.options ?? [],
            order: question.order,
          })),
        },
      },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    await this.audit.record({
      userId,
      workspaceId,
      action: 'EVENT_TYPE_CREATED',
      entityType: 'EventType',
      entityId: eventType.id,
    });

    return eventType;
  }

  async update(userId: string, id: string, dto: UpdateEventTypeDto) {
    const current = await this.get(userId, id);

    const scheduleId = dto.scheduleId
      ? await this.resolveScheduleId(userId, dto.scheduleId)
      : current.scheduleId;

    const slug =
      dto.slug && dto.slug !== current.slug ? await this.resolveSlug(userId, dto.slug, id) : current.slug;

    const locationType = dto.locationType ?? current.locationType;
    const locationValue =
      dto.locationValue !== undefined ? dto.locationValue : current.locationValue;
    this.validateLocation(locationType, locationValue);

    const data: Prisma.EventTypeUpdateInput = {
      ...(dto.name ? { name: dto.name } : {}),
      slug,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.kind ? { kind: dto.kind } : {}),
      ...(dto.durationMinutes ? { durationMinutes: dto.durationMinutes } : {}),
      ...(dto.slotIntervalMinutes ? { slotIntervalMinutes: dto.slotIntervalMinutes } : {}),
      locationType,
      locationValue,
      ...(dto.bufferBeforeMinutes !== undefined
        ? { bufferBeforeMinutes: dto.bufferBeforeMinutes }
        : {}),
      ...(dto.bufferAfterMinutes !== undefined
        ? { bufferAfterMinutes: dto.bufferAfterMinutes }
        : {}),
      ...(dto.minimumNoticeMinutes !== undefined
        ? { minimumNoticeMinutes: dto.minimumNoticeMinutes }
        : {}),
      ...(dto.bookingWindowDays !== undefined
        ? { bookingWindowDays: dto.bookingWindowDays }
        : {}),
      ...(dto.maxBookingsPerDay !== undefined
        ? { maxBookingsPerDay: dto.maxBookingsPerDay }
        : {}),
      ...(dto.minimumCancellationNoticeMinutes !== undefined
        ? { minimumCancellationNoticeMinutes: dto.minimumCancellationNoticeMinutes }
        : {}),
      ...(dto.minimumRescheduleNoticeMinutes !== undefined
        ? { minimumRescheduleNoticeMinutes: dto.minimumRescheduleNoticeMinutes }
        : {}),
      ...(dto.timezone ? { timezone: dto.timezone } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      schedule: { connect: { id: scheduleId } },
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.questions) {
        // Perguntas removidas continuam referenciadas pelas respostas antigas
        // via snapshot do label, então podem ser apagadas sem perder histórico.
        await tx.eventQuestion.deleteMany({ where: { eventTypeId: id } });
        if (dto.questions.length > 0) {
          await tx.eventQuestion.createMany({
            data: dto.questions.map((question) => ({
              eventTypeId: id,
              label: question.label,
              type: question.type,
              required: question.required,
              options: question.options ?? [],
              order: question.order,
            })),
          });
        }
      }

      return tx.eventType.update({
        where: { id },
        data,
        include: { questions: { orderBy: { order: 'asc' } } },
      });
    });

    await this.audit.record({
      userId,
      action: 'EVENT_TYPE_UPDATED',
      entityType: 'EventType',
      entityId: id,
    });

    return updated;
  }

  /** Soft delete: reservas passadas continuam apontando para o evento (§77). */
  async remove(userId: string, id: string): Promise<void> {
    await this.get(userId, id);
    await this.prisma.eventType.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.record({
      userId,
      action: 'EVENT_TYPE_DELETED',
      entityType: 'EventType',
      entityId: id,
    });
  }

  async duplicate(userId: string, workspaceId: string, id: string) {
    const source = await this.get(userId, id);

    return this.create(userId, workspaceId, {
      name: `${source.name} (cópia)`,
      slug: await this.resolveSlug(userId, `${source.slug}-copia`),
      description: source.description ?? undefined,
      scheduleId: source.scheduleId,
      kind: source.kind,
      durationMinutes: source.durationMinutes,
      slotIntervalMinutes: source.slotIntervalMinutes,
      locationType: source.locationType,
      locationValue: source.locationValue,
      bufferBeforeMinutes: source.bufferBeforeMinutes,
      bufferAfterMinutes: source.bufferAfterMinutes,
      minimumNoticeMinutes: source.minimumNoticeMinutes,
      bookingWindowDays: source.bookingWindowDays,
      maxBookingsPerDay: source.maxBookingsPerDay,
      minimumCancellationNoticeMinutes: source.minimumCancellationNoticeMinutes,
      minimumRescheduleNoticeMinutes: source.minimumRescheduleNoticeMinutes,
      timezone: source.timezone,
      isActive: false,
      questions: source.questions.map((question) => ({
        label: question.label,
        type: question.type,
        required: question.required,
        options: question.options,
        order: question.order,
      })),
    });
  }

  // -------------------------------------------------------------------------

  private async resolveScheduleId(userId: string, scheduleId?: string): Promise<string> {
    if (scheduleId) {
      await this.schedules.findOwned(userId, scheduleId); // valida ownership
      return scheduleId;
    }
    const fallback = await this.schedules.getDefault(userId);
    if (!fallback) {
      throw new BadRequestException('Crie uma agenda de disponibilidade antes do tipo de evento.');
    }
    return fallback.id;
  }

  /** Garante slug único por host, acrescentando sufixo quando necessário. */
  private async resolveSlug(userId: string, desired: string, ignoreId?: string): Promise<string> {
    const base = slugify(desired) || 'reuniao';
    let candidate = base;
    let suffix = 2;

    // Um slug só pode ser reutilizado se o evento anterior foi excluído.
    for (;;) {
      const clash = await this.prisma.eventType.findFirst({
        where: { hostUserId: userId, slug: candidate, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      });
      if (!clash) return candidate;
      candidate = `${base}-${suffix}`;
      suffix += 1;
      if (suffix > 50) throw new BadRequestException('Não foi possível gerar um slug único.');
    }
  }

  private validateLocation(locationType: string, locationValue: string | null): void {
    if (locationType === 'CUSTOM_LINK') {
      if (!locationValue || !/^https?:\/\//i.test(locationValue)) {
        throw new BadRequestException('Informe uma URL válida (http/https) para o link do evento.');
      }
    }
    if ((locationType === 'PHYSICAL' || locationType === 'PHONE') && !locationValue) {
      throw new BadRequestException(
        locationType === 'PHYSICAL'
          ? 'Informe o endereço do encontro presencial.'
          : 'Informe o telefone para a ligação.',
      );
    }
  }
}
