/**
 * Tipos de entrada/saída do AvailabilityEngine.
 *
 * O engine é puro: não conhece Prisma, Google ou Nest. Recebe tudo que
 * precisa e devolve slots. Isso o torna trivialmente testável (§68).
 */

/** Intervalo fechado-aberto [start, end) em UTC. */
export interface Interval {
  start: Date;
  end: Date;
}

export interface WeeklyRule {
  /** 0 = domingo ... 6 = sábado, no timezone do schedule. */
  weekday: number;
  /** Minutos desde a meia-noite local. */
  startMinute: number;
  endMinute: number;
}

export interface DateOverride {
  /** Data local no formato YYYY-MM-DD, no timezone do schedule. */
  date: string;
  type: 'UNAVAILABLE' | 'CUSTOM_HOURS';
  intervals: { startMinute: number; endMinute: number }[];
}

export interface EngineEventType {
  durationMinutes: number;
  slotIntervalMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minimumNoticeMinutes: number;
  bookingWindowDays: number;
  maxBookingsPerDay: number | null;
}

export interface EngineBooking extends Interval {
  /** Intervalo bloqueado (com buffers da reserva existente). */
  blocked: Interval;
  /** Id, usado para ignorar a própria reserva durante um reagendamento. */
  id?: string;
}

export interface AvailabilityQuery {
  /** Timezone IANA em que a disponibilidade semanal foi definida. */
  scheduleTimezone: string;
  /** Timezone IANA em que o visitante quer ver os horários. */
  viewerTimezone: string;
  /** Primeiro dia (YYYY-MM-DD) solicitado, interpretado no viewerTimezone. */
  rangeStartDate: string;
  /** Último dia (YYYY-MM-DD) solicitado, inclusivo. */
  rangeEndDate: string;
  eventType: EngineEventType;
  weeklyRules: WeeklyRule[];
  overrides: DateOverride[];
  /** Intervalos ocupados vindos do Google Free/Busy (UTC). */
  busyIntervals: Interval[];
  /** Reservas internas ativas do host (UTC). */
  bookings: EngineBooking[];
  /** "Agora" — injetado para tornar os testes determinísticos. */
  now: Date;
  /** Reserva a ignorar (caso de reagendamento). */
  ignoreBookingId?: string;
}

export interface Slot {
  start: Date;
  end: Date;
}

export interface DaySlots {
  /** Data local no viewerTimezone. */
  date: string;
  slots: Slot[];
}
