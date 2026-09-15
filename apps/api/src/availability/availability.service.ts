import { Inject, Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityEngine } from './engine/availability.engine';
import { DaySlots, EngineBooking, Interval } from './engine/types';
import { CALENDAR_PROVIDER, CalendarProvider } from '../integrations/calendar-provider';
import { BLOCKING_BOOKING_STATUSES } from '@agenda/shared';

export interface ComputeAvailabilityInput {
  eventTypeId: string;
  /** Primeiro dia (YYYY-MM-DD) no timezone do visitante. */
  startDate: string;
  endDate: string;
  viewerTimezone: string;
  now?: Date;
  /** Reserva a ignorar (reagendamento). */
  ignoreBookingId?: string;
  /**
   * Quando true, uma falha do Google propaga o erro em vez de degradar.
   * Usado no momento da reserva: nunca confirmamos sem checar o Google (§53).
   */
  strict?: boolean;
}

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);
  private readonly engine = new AvailabilityEngine();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CALENDAR_PROVIDER) private readonly calendar: CalendarProvider,
  ) {}

  /**
   * Monta todas as entradas do AvailabilityEngine a partir do banco e do
   * Google e devolve os slots livres.
   */
  async compute(input: ComputeAvailabilityInput): Promise<DaySlots[]> {
    const now = input.now ?? new Date();

    const eventType = await this.prisma.eventType.findUniqueOrThrow({
      where: { id: input.eventTypeId },
      include: {
        schedule: { include: { rules: true, overrides: { include: { intervals: true } } } },
        host: true,
      },
    });

    const scheduleTimezone = eventType.schedule.timezone;

    // Janela em UTC que cobre todos os dias pedidos no fuso do visitante,
    // com um dia de folga em cada ponta por causa da conversão de fuso.
    const windowStart = DateTime.fromISO(input.startDate, { zone: input.viewerTimezone })
      .startOf('day')
      .minus({ days: 1 })
      .toJSDate();
    const windowEnd = DateTime.fromISO(input.endDate, { zone: input.viewerTimezone })
      .endOf('day')
      .plus({ days: 1 })
      .toJSDate();

    const [busyIntervals, bookings] = await Promise.all([
      this.loadBusyIntervals(eventType.hostUserId, windowStart, windowEnd, input.strict ?? false),
      this.loadBookings(eventType.hostUserId, windowStart, windowEnd),
    ]);

    return this.engine.generate({
      scheduleTimezone,
      viewerTimezone: input.viewerTimezone,
      rangeStartDate: input.startDate,
      rangeEndDate: input.endDate,
      eventType: {
        durationMinutes: eventType.durationMinutes,
        slotIntervalMinutes: eventType.slotIntervalMinutes,
        bufferBeforeMinutes: eventType.bufferBeforeMinutes,
        bufferAfterMinutes: eventType.bufferAfterMinutes,
        minimumNoticeMinutes: eventType.minimumNoticeMinutes,
        bookingWindowDays: eventType.bookingWindowDays,
        maxBookingsPerDay: eventType.maxBookingsPerDay,
      },
      weeklyRules: eventType.schedule.rules.map((rule) => ({
        weekday: rule.weekday,
        startMinute: rule.startMinute,
        endMinute: rule.endMinute,
      })),
      overrides: eventType.schedule.overrides.map((override) => ({
        date: DateTime.fromJSDate(override.date, { zone: 'utc' }).toISODate() as string,
        type: override.type,
        intervals: override.intervals.map((interval) => ({
          startMinute: interval.startMinute,
          endMinute: interval.endMinute,
        })),
      })),
      busyIntervals,
      bookings,
      now,
      ignoreBookingId: input.ignoreBookingId,
    });
  }

  /** Verifica se um horário exato ainda está livre. Usado antes de reservar. */
  async isSlotAvailable(params: {
    eventTypeId: string;
    start: Date;
    viewerTimezone: string;
    now?: Date;
    ignoreBookingId?: string;
  }): Promise<boolean> {
    const day = DateTime.fromJSDate(params.start, { zone: params.viewerTimezone }).toISODate();
    if (!day) return false;

    const days = await this.compute({
      eventTypeId: params.eventTypeId,
      startDate: day,
      endDate: day,
      viewerTimezone: params.viewerTimezone,
      now: params.now,
      ignoreBookingId: params.ignoreBookingId,
      strict: true, // nunca confirmar sem falar com o Google
    });

    const target = params.start.getTime();
    return days.some((entry) => entry.slots.some((slot) => slot.start.getTime() === target));
  }

  /**
   * Free/Busy das agendas marcadas para verificação de conflito.
   *
   * Sem conexão Google ativa o sistema continua funcionando apenas com as
   * reservas internas — mas no caminho crítico da reserva (`strict`) uma
   * falha do Google interrompe a operação em vez de liberar horários
   * indevidamente (§83).
   */
  private async loadBusyIntervals(
    hostUserId: string,
    windowStart: Date,
    windowEnd: Date,
    strict: boolean,
  ): Promise<Interval[]> {
    const connection = await this.prisma.calendarConnection.findFirst({
      where: { userId: hostUserId, status: 'CONNECTED' },
      include: { calendars: { where: { checkConflicts: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (!connection || connection.calendars.length === 0) return [];

    try {
      return await this.calendar.getFreeBusy(
        { connectionId: connection.id, userId: hostUserId },
        {
          calendarIds: connection.calendars.map((calendar) => calendar.providerCalendarId),
          timeMin: windowStart,
          timeMax: windowEnd,
        },
      );
    } catch (error) {
      if (strict) throw error;
      // Fora do caminho crítico, preferimos exibir a agenda interna a
      // derrubar a página pública; a reserva será revalidada com o Google.
      this.logger.warn(
        `Free/Busy indisponível para o host ${hostUserId}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  private async loadBookings(
    hostUserId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<EngineBooking[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        hostUserId,
        status: { in: BLOCKING_BOOKING_STATUSES },
        blockedEndAt: { gt: windowStart },
        blockedStartAt: { lt: windowEnd },
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        blockedStartAt: true,
        blockedEndAt: true,
      },
    });

    return bookings.map((booking) => ({
      id: booking.id,
      start: booking.startAt,
      end: booking.endAt,
      blocked: { start: booking.blockedStartAt, end: booking.blockedEndAt },
    }));
  }
}
