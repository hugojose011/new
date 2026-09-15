import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  AvailabilityResponseDto,
  PublicEventTypeDto,
} from '@agenda/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { APP_CONFIG, AppConfig } from '../config/configuration';

/** Janela máxima consultável por requisição, para não varrer meses inteiros (§67). */
const MAX_RANGE_DAYS = 62;

interface CacheEntry {
  expiresAt: number;
  value: AvailabilityResponseDto;
}

@Injectable()
export class PublicService {
  /**
   * Cache curto e em memória da disponibilidade pública (§53).
   *
   * Serve só para absorver rajadas de leitura da página pública. O POST /book
   * NUNCA consulta este cache: ele refaz a checagem completa, inclusive no
   * Google. Qualquer reserva/cancelamento/reagendamento invalida a entrada.
   */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async findEventType(username: string, slug: string) {
    const eventType = await this.prisma.eventType.findFirst({
      where: {
        slug,
        isActive: true,
        deletedAt: null,
        host: { username: username.toLowerCase() },
      },
      include: {
        host: true,
        questions: { orderBy: { order: 'asc' } },
        schedule: true,
      },
    });
    if (!eventType) throw new NotFoundException('Página de agendamento não encontrada.');
    return eventType;
  }

  async getPublicEventType(username: string, slug: string): Promise<PublicEventTypeDto> {
    const eventType = await this.findEventType(username, slug);

    return {
      id: eventType.id,
      name: eventType.name,
      slug: eventType.slug,
      description: eventType.description,
      durationMinutes: eventType.durationMinutes,
      locationType: eventType.locationType,
      // Só o tipo do local é público; endereço/telefone vão no e-mail e no
      // evento do calendário, não na página aberta.
      locationValue:
        eventType.locationType === 'CUSTOM_LINK' ? null : eventType.locationValue,
      timezone: eventType.schedule.timezone,
      kind: eventType.kind,
      host: {
        name: eventType.host.name,
        username: eventType.host.username as string,
        timezone: eventType.host.timezone,
      },
      questions: eventType.questions.map((question) => ({
        id: question.id,
        label: question.label,
        type: question.type,
        required: question.required,
        options: question.options,
        order: question.order,
      })),
    };
  }

  /**
   * Disponibilidade pública.
   *
   * Devolve apenas início/fim dos horários livres — nunca o motivo de um
   * horário estar ocupado, nem qualquer dado dos compromissos do host (§49).
   */
  async getAvailability(
    username: string,
    slug: string,
    params: { startDate: string; endDate: string; timezone: string },
  ): Promise<AvailabilityResponseDto> {
    const eventType = await this.findEventType(username, slug);

    const start = DateTime.fromISO(params.startDate, { zone: params.timezone });
    let end = DateTime.fromISO(params.endDate, { zone: params.timezone });
    if (!start.isValid || !end.isValid) {
      throw new NotFoundException('Intervalo de datas inválido.');
    }
    if (end.diff(start, 'days').days > MAX_RANGE_DAYS) {
      end = start.plus({ days: MAX_RANGE_DAYS });
    }

    const cacheKey = `${eventType.id}|${params.timezone}|${start.toISODate()}|${end.toISODate()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const days = await this.availability.compute({
      eventTypeId: eventType.id,
      startDate: start.toISODate() as string,
      endDate: end.toISODate() as string,
      viewerTimezone: params.timezone,
    });

    const response: AvailabilityResponseDto = {
      timezone: params.timezone,
      durationMinutes: eventType.durationMinutes,
      days: days.map((day) => ({
        date: day.date,
        timezone: params.timezone,
        slots: day.slots.map((slot) => ({
          start: DateTime.fromJSDate(slot.start, { zone: params.timezone }).toISO() as string,
          end: DateTime.fromJSDate(slot.end, { zone: params.timezone }).toISO() as string,
        })),
      })),
    };

    if (this.config.availabilityCacheTtlSeconds > 0) {
      this.cache.set(cacheKey, {
        value: response,
        expiresAt: Date.now() + this.config.availabilityCacheTtlSeconds * 1000,
      });
      this.pruneCache();
    }

    return response;
  }

  /** Invalida o cache de um evento após qualquer mudança de agenda. */
  invalidate(eventTypeId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${eventTypeId}|`)) this.cache.delete(key);
    }
  }

  private pruneCache(): void {
    if (this.cache.size < 500) return;
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
  }
}
