import { DateTime, Interval as LuxonInterval } from 'luxon';
import { isIanaTimezone } from '@agenda/shared';
import {
  AvailabilityQuery,
  DateOverride,
  DaySlots,
  EngineBooking,
  Interval,
  Slot,
  WeeklyRule,
} from './types';

/**
 * AvailabilityEngine
 * ------------------
 * Implementa a fórmula do domínio:
 *
 *   AVAILABLE_SLOTS =
 *     ConfiguredAvailability
 *     − GoogleBusyIntervals
 *     − InternalBookings
 *     − Buffers
 *     − DateOverrides
 *     − BookingRestrictions (antecedência, janela, limite diário)
 *
 * Regras de tempo adotadas (ver docs/decisoes.md):
 *
 * 1. Toda a aritmética acontece em UTC (`Date`/epoch). Timezones IANA são
 *    usados apenas nas bordas: ao traduzir "09:00 de segunda" para instantes e
 *    ao agrupar os slots por dia para o visitante.
 * 2. Horários da agenda são interpretados como hora de parede (wall clock) no
 *    timezone do schedule. Em dias de DST isso é o comportamento correto:
 *    "09:00" continua sendo 09:00 local, mesmo que o offset mude.
 * 3. Intervalos são sempre fechado-aberto `[start, end)`. Uma reunião que
 *    termina às 15:00 não conflita com outra que começa às 15:00.
 * 4. Buffers são aplicados ao candidato *e* já estão embutidos no intervalo
 *    bloqueado das reservas existentes. Dois buffers de 15 minutos, portanto,
 *    produzem 30 minutos de folga entre reuniões — que é o comportamento
 *    esperado ("15 min depois desta" + "15 min antes da próxima").
 */
export class AvailabilityEngine {
  /** Gera os slots disponíveis agrupados por dia no timezone do visitante. */
  generate(query: AvailabilityQuery): DaySlots[] {
    const viewerZone = query.viewerTimezone;
    assertZone(viewerZone, 'viewerTimezone');
    assertZone(query.scheduleTimezone, 'scheduleTimezone');

    const rangeStart = startOfDay(query.rangeStartDate, viewerZone);
    const rangeEnd = startOfDay(query.rangeEndDate, viewerZone).plus({ days: 1 });
    if (rangeEnd <= rangeStart) return [];

    const windows = this.buildConfiguredWindows(query, rangeStart, rangeEnd);
    const candidates = this.buildCandidateSlots(windows, query);
    const allowed = this.applyRestrictions(candidates, query);
    return this.groupByViewerDate(allowed, query, rangeStart, rangeEnd);
  }

  // -------------------------------------------------------------------------
  // 1. Disponibilidade configurada (regras semanais + exceções por data)
  // -------------------------------------------------------------------------
  private buildConfiguredWindows(
    query: AvailabilityQuery,
    rangeStart: DateTime,
    rangeEnd: DateTime,
  ): Interval[] {
    const zone = query.scheduleTimezone;
    const overridesByDate = new Map<string, DateOverride>(
      query.overrides.map((override) => [override.date, override]),
    );
    const rulesByWeekday = groupRulesByWeekday(query.weeklyRules);

    // Margem de um dia em cada ponta: o dia local do schedule pode "vazar"
    // para dentro do intervalo pedido pelo visitante em outro fuso.
    let cursor = rangeStart.setZone(zone).startOf('day').minus({ days: 1 });
    const last = rangeEnd.setZone(zone).startOf('day').plus({ days: 1 });

    const windows: Interval[] = [];
    while (cursor <= last) {
      const isoDate = cursor.toISODate() as string;
      const override = overridesByDate.get(isoDate);

      let dayIntervals: { startMinute: number; endMinute: number }[];
      if (override) {
        // Exceções têm prioridade absoluta sobre a disponibilidade semanal.
        dayIntervals = override.type === 'UNAVAILABLE' ? [] : override.intervals;
      } else {
        dayIntervals = rulesByWeekday.get(cursor.weekday % 7) ?? [];
      }

      for (const { startMinute, endMinute } of mergeMinuteIntervals(dayIntervals)) {
        const start = localMinuteToUtc(isoDate, startMinute, zone);
        const end = localMinuteToUtc(isoDate, endMinute, zone);
        if (start && end && end > start) windows.push({ start, end });
      }

      cursor = cursor.plus({ days: 1 });
    }

    return windows.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  // -------------------------------------------------------------------------
  // 2. Slots candidatos (duração + intervalo de exibição)
  // -------------------------------------------------------------------------
  private buildCandidateSlots(windows: Interval[], query: AvailabilityQuery): Slot[] {
    const { durationMinutes, slotIntervalMinutes } = query.eventType;
    const durationMs = durationMinutes * 60_000;
    const stepMs = slotIntervalMinutes * 60_000;
    const slots: Slot[] = [];

    for (const window of windows) {
      const windowEnd = window.end.getTime();
      for (let ts = window.start.getTime(); ts + durationMs <= windowEnd; ts += stepMs) {
        slots.push({ start: new Date(ts), end: new Date(ts + durationMs) });
      }
    }

    // Janelas diferentes podem gerar o mesmo horário (ex.: exceção + regra).
    const unique = new Map<number, Slot>();
    for (const slot of slots) unique.set(slot.start.getTime(), slot);
    return [...unique.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  // -------------------------------------------------------------------------
  // 3. Restrições
  // -------------------------------------------------------------------------
  private applyRestrictions(candidates: Slot[], query: AvailabilityQuery): Slot[] {
    const {
      minimumNoticeMinutes,
      bookingWindowDays,
      bufferBeforeMinutes,
      bufferAfterMinutes,
      maxBookingsPerDay,
    } = query.eventType;

    const earliest = new Date(query.now.getTime() + minimumNoticeMinutes * 60_000);
    // A janela é contada em dias de calendário no timezone do host e inclui
    // o dia de hoje: bookingWindowDays = 30 libera hoje + os próximos 29 dias.
    const horizon = DateTime.fromJSDate(query.now, { zone: query.scheduleTimezone })
      .startOf('day')
      .plus({ days: bookingWindowDays })
      .toJSDate();

    const activeBookings = query.bookings.filter(
      (booking) => !query.ignoreBookingId || booking.id !== query.ignoreBookingId,
    );
    const fullDays = this.daysAtBookingLimit(activeBookings, query, maxBookingsPerDay);

    return candidates.filter((slot) => {
      if (slot.start < earliest) return false;
      if (slot.start >= horizon) return false;

      const blocked: Interval = {
        start: new Date(slot.start.getTime() - bufferBeforeMinutes * 60_000),
        end: new Date(slot.end.getTime() + bufferAfterMinutes * 60_000),
      };

      if (query.busyIntervals.some((busy) => overlaps(blocked, busy))) return false;
      if (activeBookings.some((booking) => overlaps(blocked, booking.blocked))) return false;

      if (fullDays.size > 0) {
        const day = DateTime.fromJSDate(slot.start, { zone: query.scheduleTimezone }).toISODate();
        if (day && fullDays.has(day)) return false;
      }

      return true;
    });
  }

  /** Dias (no timezone do host) que já atingiram o limite de reuniões. */
  private daysAtBookingLimit(
    bookings: EngineBooking[],
    query: AvailabilityQuery,
    maxBookingsPerDay: number | null,
  ): Set<string> {
    const full = new Set<string>();
    if (!maxBookingsPerDay || maxBookingsPerDay <= 0) return full;

    const perDay = new Map<string, number>();
    for (const booking of bookings) {
      const day = DateTime.fromJSDate(booking.start, { zone: query.scheduleTimezone }).toISODate();
      if (!day) continue;
      const count = (perDay.get(day) ?? 0) + 1;
      perDay.set(day, count);
      if (count >= maxBookingsPerDay) full.add(day);
    }
    return full;
  }

  // -------------------------------------------------------------------------
  // 4. Agrupamento no timezone do visitante
  // -------------------------------------------------------------------------
  private groupByViewerDate(
    slots: Slot[],
    query: AvailabilityQuery,
    rangeStart: DateTime,
    rangeEnd: DateTime,
  ): DaySlots[] {
    const zone = query.viewerTimezone;
    const byDate = new Map<string, Slot[]>();

    // Pré-popula todos os dias do intervalo para que o frontend saiba quais
    // dias foram consultados (e possa exibir "sem horários").
    let cursor = rangeStart;
    while (cursor < rangeEnd) {
      byDate.set(cursor.toISODate() as string, []);
      cursor = cursor.plus({ days: 1 });
    }

    for (const slot of slots) {
      const local = DateTime.fromJSDate(slot.start, { zone });
      const date = local.toISODate();
      if (!date) continue;
      const bucket = byDate.get(date);
      if (bucket) bucket.push(slot);
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, daySlots]) => ({ date, slots: daySlots }));
  }
}

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Exige um identificador IANA real. Offsets fixos ("-03:00") são recusados
 * porque ignoram horário de verão — o erro clássico de agenda (§26).
 */
function assertZone(zone: string, field: string): void {
  if (!isIanaTimezone(zone)) {
    throw new Error(`Timezone IANA inválido em ${field}: ${zone}`);
  }
}

function startOfDay(isoDate: string, zone: string): DateTime {
  const dt = DateTime.fromISO(isoDate, { zone });
  if (!dt.isValid) throw new Error(`Data inválida: ${isoDate}`);
  return dt.startOf('day');
}

/**
 * Converte "minutos desde a meia-noite local" em um instante UTC.
 *
 * Usa hora de parede em vez de somar minutos ao início do dia: em uma
 * transição de horário de verão, somar 540 minutos à meia-noite poderia
 * resultar em 10:00 local em vez de 09:00. 1440 representa a meia-noite
 * do dia seguinte.
 *
 * Retorna null se o horário local não existir (salto de DST) e não puder
 * ser resolvido — Luxon normalmente empurra para o instante válido seguinte.
 */
function localMinuteToUtc(isoDate: string, minute: number, zone: string): Date | null {
  const base = DateTime.fromISO(isoDate, { zone });
  if (!base.isValid) return null;
  const day = minute >= 24 * 60 ? base.plus({ days: 1 }) : base;
  const remainder = minute >= 24 * 60 ? minute - 24 * 60 : minute;
  const dt = day.set({
    hour: Math.floor(remainder / 60),
    minute: remainder % 60,
    second: 0,
    millisecond: 0,
  });
  return dt.isValid ? dt.toJSDate() : null;
}

function groupRulesByWeekday(rules: WeeklyRule[]): Map<number, WeeklyRule[]> {
  const map = new Map<number, WeeklyRule[]>();
  for (const rule of rules) {
    const list = map.get(rule.weekday) ?? [];
    list.push(rule);
    map.set(rule.weekday, list);
  }
  return map;
}

/** Une intervalos de minutos sobrepostos/adjacentes e os ordena. */
export function mergeMinuteIntervals(
  intervals: { startMinute: number; endMinute: number }[],
): { startMinute: number; endMinute: number }[] {
  const sorted = [...intervals]
    .filter((i) => i.endMinute > i.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute);

  const merged: { startMinute: number; endMinute: number }[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, current.endMinute);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/** Une intervalos de tempo sobrepostos (usado para normalizar free/busy). */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current.start <= last.end) {
      if (current.end > last.end) last.end = current.end;
    } else {
      merged.push({ start: new Date(current.start), end: new Date(current.end) });
    }
  }
  return merged;
}

/** Duração total de um conjunto de intervalos, em minutos. */
export function totalMinutes(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce(
    (acc, interval) =>
      acc + LuxonInterval.fromDateTimes(interval.start, interval.end).length('minutes'),
    0,
  );
}
