import { DateTime } from 'luxon';
import { AvailabilityEngine } from './availability.engine';
import { AvailabilityQuery, DaySlots, EngineBooking } from './types';

const SP = 'America/Sao_Paulo';
const NY = 'America/New_York';

const engine = new AvailabilityEngine();

function utc(iso: string): Date {
  return new Date(iso);
}

/** Horários locais (no timezone informado) de um dia, em HH:mm. */
function times(days: DaySlots[], date: string, zone = SP): string[] {
  const day = days.find((d) => d.date === date);
  if (!day) return [];
  return day.slots.map((slot) => DateTime.fromJSDate(slot.start, { zone }).toFormat('HH:mm'));
}

function baseQuery(overrides: Partial<AvailabilityQuery> = {}): AvailabilityQuery {
  return {
    scheduleTimezone: SP,
    viewerTimezone: SP,
    rangeStartDate: '2026-10-05', // segunda-feira
    rangeEndDate: '2026-10-05',
    eventType: {
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 0,
      bookingWindowDays: 60,
      maxBookingsPerDay: null,
    },
    weeklyRules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 }],
    overrides: [],
    busyIntervals: [],
    bookings: [],
    now: utc('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

function booking(startIso: string, endIso: string, buffers = { before: 0, after: 0 }): EngineBooking {
  const start = utc(startIso);
  const end = utc(endIso);
  return {
    start,
    end,
    blocked: {
      start: new Date(start.getTime() - buffers.before * 60_000),
      end: new Date(end.getTime() + buffers.after * 60_000),
    },
  };
}

describe('AvailabilityEngine', () => {
  it('gera a disponibilidade semanal normal', () => {
    const days = engine.generate(baseQuery());
    expect(times(days, '2026-10-05')).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
    ]);
  });

  it('retorna dia vazio quando não há regra para aquele dia da semana', () => {
    const days = engine.generate(
      baseQuery({ rangeStartDate: '2026-10-07', rangeEndDate: '2026-10-07' }), // quarta
    );
    expect(days).toHaveLength(1);
    expect(days[0].slots).toEqual([]);
  });

  it('suporta dois intervalos no mesmo dia', () => {
    const days = engine.generate(
      baseQuery({
        weeklyRules: [
          { weekday: 1, startMinute: 8 * 60, endMinute: 10 * 60 },
          { weekday: 1, startMinute: 14 * 60, endMinute: 15 * 60 },
        ],
      }),
    );
    expect(times(days, '2026-10-05')).toEqual(['08:00', '08:30', '09:00', '09:30', '14:00', '14:30']);
  });

  it('une intervalos sobrepostos configurados no mesmo dia', () => {
    const days = engine.generate(
      baseQuery({
        weeklyRules: [
          { weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60 },
          { weekday: 1, startMinute: 9 * 60 + 30, endMinute: 11 * 60 },
        ],
      }),
    );
    expect(times(days, '2026-10-05')).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });

  it('exceção UNAVAILABLE bloqueia o dia inteiro', () => {
    const days = engine.generate(
      baseQuery({ overrides: [{ date: '2026-10-05', type: 'UNAVAILABLE', intervals: [] }] }),
    );
    expect(times(days, '2026-10-05')).toEqual([]);
  });

  it('exceção CUSTOM_HOURS substitui a disponibilidade semanal', () => {
    const days = engine.generate(
      baseQuery({
        overrides: [
          {
            date: '2026-10-05',
            type: 'CUSTOM_HOURS',
            intervals: [{ startMinute: 9 * 60, endMinute: 11 * 60 }],
          },
        ],
      }),
    );
    expect(times(days, '2026-10-05')).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });

  it('remove slots ocupados por eventos do Google', () => {
    const days = engine.generate(
      baseQuery({
        busyIntervals: [{ start: utc('2026-10-05T13:00:00Z'), end: utc('2026-10-05T14:00:00Z') }],
      }),
    );
    // 13:00Z = 10:00 em São Paulo (UTC-3)
    expect(times(days, '2026-10-05')).toEqual(['09:00', '09:30', '11:00', '11:30']);
  });

  it('remove slots ocupados por reservas internas', () => {
    const days = engine.generate(
      baseQuery({ bookings: [booking('2026-10-05T12:00:00Z', '2026-10-05T12:30:00Z')] }),
    );
    expect(times(days, '2026-10-05')).toEqual(['09:30', '10:00', '10:30', '11:00', '11:30']);
  });

  it('não bloqueia slots apenas encostados (intervalo fechado-aberto)', () => {
    const days = engine.generate(
      baseQuery({
        busyIntervals: [{ start: utc('2026-10-05T12:00:00Z'), end: utc('2026-10-05T12:30:00Z') }],
      }),
    );
    // 12:30Z = 09:30 local deve continuar livre.
    expect(times(days, '2026-10-05')).toContain('09:30');
  });

  it('remove eventos parcialmente sobrepostos', () => {
    const days = engine.generate(
      baseQuery({
        busyIntervals: [{ start: utc('2026-10-05T12:15:00Z'), end: utc('2026-10-05T12:45:00Z') }],
      }),
    );
    expect(times(days, '2026-10-05')).toEqual(['10:00', '10:30', '11:00', '11:30']);
  });

  it('aplica buffer anterior do candidato', () => {
    const days = engine.generate(
      baseQuery({
        eventType: { ...baseQuery().eventType, bufferBeforeMinutes: 15 },
        // Reunião existente 09:00-09:30 local (12:00Z-12:30Z)
        bookings: [booking('2026-10-05T12:00:00Z', '2026-10-05T12:30:00Z')],
      }),
    );
    // 09:30 exigiria começar a bloquear 09:15 -> conflita. 10:00 é o primeiro livre.
    expect(times(days, '2026-10-05')).toEqual(['10:00', '10:30', '11:00', '11:30']);
  });

  it('aplica buffer posterior de uma reserva existente', () => {
    const days = engine.generate(
      baseQuery({
        bookings: [booking('2026-10-05T12:00:00Z', '2026-10-05T12:30:00Z', { before: 0, after: 15 })],
      }),
    );
    expect(times(days, '2026-10-05')).toEqual(['10:00', '10:30', '11:00', '11:30']);
  });

  it('combina buffer da reserva existente com buffer do candidato', () => {
    const days = engine.generate(
      baseQuery({
        eventType: { ...baseQuery().eventType, bufferBeforeMinutes: 15, bufferAfterMinutes: 15 },
        weeklyRules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 18 * 60 }],
        // 14:00-15:00 local, com 15 min de buffer dos dois lados => 13:45-15:15
        bookings: [
          booking('2026-10-05T17:00:00Z', '2026-10-05T18:00:00Z', { before: 15, after: 15 }),
        ],
      }),
    );
    const slots = times(days, '2026-10-05');
    expect(slots).not.toContain('13:30'); // 13:30-14:00 + buffers => 13:15-14:15
    expect(slots).not.toContain('15:00'); // bloqueado pelo buffer posterior + anterior
    expect(slots).toContain('13:00');
    expect(slots).toContain('15:30');
  });

  it('respeita a antecedência mínima', () => {
    const days = engine.generate(
      baseQuery({
        now: utc('2026-10-05T12:00:00Z'), // 09:00 local
        eventType: { ...baseQuery().eventType, minimumNoticeMinutes: 120 },
      }),
    );
    // Só a partir de 11:00 local.
    expect(times(days, '2026-10-05')).toEqual(['11:00', '11:30']);
  });

  it('respeita a janela máxima de agendamento', () => {
    const days = engine.generate(
      baseQuery({
        now: utc('2026-10-01T12:00:00Z'),
        rangeStartDate: '2026-10-05',
        rangeEndDate: '2026-10-12',
        weeklyRules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60 }],
        eventType: { ...baseQuery().eventType, bookingWindowDays: 5 },
      }),
    );
    // Janela: 01/10 até 05/10 inclusive. 12/10 fica fora.
    expect(times(days, '2026-10-05')).toEqual(['09:00', '09:30']);
    expect(times(days, '2026-10-12')).toEqual([]);
  });

  it('respeita o limite diário de reuniões', () => {
    const days = engine.generate(
      baseQuery({
        eventType: { ...baseQuery().eventType, maxBookingsPerDay: 2 },
        bookings: [
          booking('2026-10-05T12:00:00Z', '2026-10-05T12:30:00Z'),
          booking('2026-10-05T14:00:00Z', '2026-10-05T14:30:00Z'),
        ],
      }),
    );
    expect(times(days, '2026-10-05')).toEqual([]);
  });

  it('libera o dia quando o limite diário ainda não foi atingido', () => {
    const days = engine.generate(
      baseQuery({
        eventType: { ...baseQuery().eventType, maxBookingsPerDay: 3 },
        bookings: [booking('2026-10-05T12:00:00Z', '2026-10-05T12:30:00Z')],
      }),
    );
    expect(times(days, '2026-10-05')).toEqual(['09:30', '10:00', '10:30', '11:00', '11:30']);
  });

  it('suporta slotInterval diferente da duração', () => {
    const days = engine.generate(
      baseQuery({
        eventType: { ...baseQuery().eventType, durationMinutes: 60, slotIntervalMinutes: 30 },
      }),
    );
    expect(times(days, '2026-10-05')).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00']);
  });

  it('não gera slot que ultrapasse o fim da janela', () => {
    const days = engine.generate(
      baseQuery({
        weeklyRules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60 }],
        eventType: { ...baseQuery().eventType, durationMinutes: 45, slotIntervalMinutes: 15 },
      }),
    );
    expect(times(days, '2026-10-05')).toEqual(['09:00', '09:15']);
  });

  it('converte os horários para o timezone do visitante', () => {
    const days = engine.generate(baseQuery({ viewerTimezone: NY }));
    // 09:00 em São Paulo (UTC-3) = 08:00 em Nova York (UTC-4, horário de verão).
    expect(times(days, '2026-10-05', NY)).toEqual([
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '10:00',
      '10:30',
    ]);
  });

  it('lida com mudança de dia causada pelo timezone do visitante', () => {
    const days = engine.generate(
      baseQuery({
        scheduleTimezone: SP,
        viewerTimezone: 'Asia/Tokyo',
        rangeStartDate: '2026-10-06',
        rangeEndDate: '2026-10-06',
        weeklyRules: [{ weekday: 1, startMinute: 20 * 60, endMinute: 21 * 60 }], // segunda 20h SP
      }),
    );
    // Segunda 20:00 em SP = terça 08:00 em Tóquio.
    expect(times(days, '2026-10-06', 'Asia/Tokyo')).toEqual(['08:00', '08:30']);
  });

  it('mantém a hora de parede na virada do horário de verão em Nova York', () => {
    // 01/11/2026 é domingo de fim do DST nos EUA (relógio volta às 02:00).
    const days = engine.generate(
      baseQuery({
        scheduleTimezone: NY,
        viewerTimezone: NY,
        rangeStartDate: '2026-11-01',
        rangeEndDate: '2026-11-02',
        weeklyRules: [
          { weekday: 0, startMinute: 9 * 60, endMinute: 10 * 60 }, // domingo
          { weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60 }, // segunda
        ],
        now: utc('2026-10-01T12:00:00Z'),
      }),
    );

    const sunday = days.find((d) => d.date === '2026-11-01');
    const monday = days.find((d) => d.date === '2026-11-02');
    expect(times(days, '2026-11-01', NY)).toEqual(['09:00', '09:30']);
    expect(times(days, '2026-11-02', NY)).toEqual(['09:00', '09:30']);
    // Offsets diferentes: domingo já é EST (-05:00), mas a hora local é a mesma.
    expect(sunday!.slots[0].start.toISOString()).toBe('2026-11-01T14:00:00.000Z');
    expect(monday!.slots[0].start.toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });

  it('não assume UTC-3 fixo: antes e depois do DST o offset muda', () => {
    const before = engine.generate(
      baseQuery({
        scheduleTimezone: NY,
        viewerTimezone: NY,
        rangeStartDate: '2026-10-05',
        rangeEndDate: '2026-10-05',
      }),
    );
    // 09:00 EDT = 13:00Z
    expect(before[0].slots[0].start.toISOString()).toBe('2026-10-05T13:00:00.000Z');
  });

  it('considera conflitos vindos de múltiplos calendários', () => {
    const days = engine.generate(
      baseQuery({
        busyIntervals: [
          { start: utc('2026-10-05T12:00:00Z'), end: utc('2026-10-05T12:30:00Z') }, // agenda A
          { start: utc('2026-10-05T14:00:00Z'), end: utc('2026-10-05T14:30:00Z') }, // agenda B
        ],
      }),
    );
    // 12:00Z bloqueia 09:00 e 14:00Z bloqueia 11:00; o restante segue livre.
    expect(times(days, '2026-10-05')).toEqual(['09:30', '10:00', '10:30', '11:30']);
  });

  it('ignora a própria reserva durante um reagendamento', () => {
    const existing = booking('2026-10-05T12:00:00Z', '2026-10-05T12:30:00Z');
    existing.id = 'booking-1';

    const withoutIgnore = engine.generate(baseQuery({ bookings: [existing] }));
    expect(times(withoutIgnore, '2026-10-05')).not.toContain('09:00');

    const withIgnore = engine.generate(
      baseQuery({ bookings: [existing], ignoreBookingId: 'booking-1' }),
    );
    expect(times(withIgnore, '2026-10-05')).toContain('09:00');
  });

  it('rejeita timezone inválido', () => {
    expect(() => engine.generate(baseQuery({ viewerTimezone: 'Marte/Olympus' }))).toThrow(
      /Timezone IANA inválido/,
    );
  });

  it('retorna todos os dias solicitados, mesmo vazios', () => {
    const days = engine.generate(
      baseQuery({ rangeStartDate: '2026-10-05', rangeEndDate: '2026-10-08' }),
    );
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ]);
  });
});

describe('AvailabilityEngine — validação de timezone', () => {
  const engineLocal = new AvailabilityEngine();

  const base = {
    scheduleTimezone: 'America/Sao_Paulo',
    viewerTimezone: 'UTC',
    rangeStartDate: '2026-10-05',
    rangeEndDate: '2026-10-05',
    eventType: {
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 0,
      bookingWindowDays: 60,
      maxBookingsPerDay: null,
    },
    weeklyRules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60 }],
    overrides: [],
    busyIntervals: [],
    bookings: [],
    now: new Date('2026-10-01T12:00:00Z'),
  };

  it('aceita "UTC" como timezone do visitante', () => {
    const days = engineLocal.generate(base);
    // 09:00 em São Paulo = 12:00 UTC.
    expect(days[0].slots[0].start.toISOString()).toBe('2026-10-05T12:00:00.000Z');
  });

  it('recusa offset fixo em vez de identificador IANA', () => {
    expect(() => engineLocal.generate({ ...base, viewerTimezone: '-03:00' })).toThrow(
      /Timezone IANA inválido/,
    );
  });
});
