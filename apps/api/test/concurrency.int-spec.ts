import request from 'supertest';
import { DateTime } from 'luxon';
import { createTestApp, resetDatabase, TestContext } from './utils/test-app';
import { connectFakeGoogle, createEventType, createHost, HostSession } from './utils/fixtures';

/**
 * Teste crítico de concorrência (§69).
 *
 * Duas requisições simultâneas para o mesmo host e o mesmo horário: apenas
 * uma pode ser confirmada. A garantia não vem do frontend nem do cache, e sim
 * da constraint de exclusão `bookings_no_overlap` no PostgreSQL.
 */
describe('Prevenção de double booking sob concorrência', () => {
  let ctx: TestContext;
  let host: HostSession;
  let eventType: { id: string; slug: string };

  const TZ = 'America/Sao_Paulo';
  const targetDate = DateTime.now()
    .setZone(TZ)
    .plus({ days: 7 })
    .set({ weekday: 3 })
    .toISODate() as string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    ctx.calendar.reset();
    host = await createHost(ctx.app, ctx.prisma, { timezone: TZ });
    await connectFakeGoogle(ctx.prisma, host.userId);
    eventType = await createEventType(ctx.app, host, {
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
    });
  });

  const server = () => request(ctx.app.getHttpServer());

  async function firstSlot(): Promise<string> {
    const response = await server()
      .get(`/public/${host.username}/${eventType.slug}/availability`)
      .query({ startDate: targetDate, endDate: targetDate, timezone: TZ })
      .expect(200);
    return response.body.days[0].slots[0].start;
  }

  it('confirma apenas uma entre duas reservas simultâneas do mesmo horário', async () => {
    const start = await firstSlot();

    const [a, b] = await Promise.all([
      server()
        .post(`/public/${host.username}/${eventType.slug}/book`)
        .send({ start, timezone: TZ, name: 'Pessoa A', email: 'a@exemplo.com' }),
      server()
        .post(`/public/${host.username}/${eventType.slug}/book`)
        .send({ start, timezone: TZ, name: 'Pessoa B', email: 'b@exemplo.com' }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const confirmed = await ctx.prisma.booking.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED'] } },
    });
    expect(confirmed).toHaveLength(1);
  });

  it('suporta uma rajada de dez requisições no mesmo horário', async () => {
    const start = await firstSlot();

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        server()
          .post(`/public/${host.username}/${eventType.slug}/book`)
          .send({
            start,
            timezone: TZ,
            name: `Pessoa ${index}`,
            email: `pessoa${index}@exemplo.com`,
          }),
      ),
    );

    const created = responses.filter((response) => response.status === 201);
    const conflicts = responses.filter((response) => response.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(9);

    const active = await ctx.prisma.booking.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED'] } },
    });
    expect(active).toHaveLength(1);
  });

  it('impede reservas sobrepostas por causa do buffer, não apenas idênticas', async () => {
    const start = await firstSlot();
    const overlapping = DateTime.fromISO(start).plus({ minutes: 30 }).toISO() as string;

    // Evento de 30 min com 15 de buffer dos dois lados bloqueia 60 min:
    // a reserva seguinte só caberia 60 minutos depois.
    const [a, b] = await Promise.all([
      server()
        .post(`/public/${host.username}/${eventType.slug}/book`)
        .send({ start, timezone: TZ, name: 'Pessoa A', email: 'a@exemplo.com' }),
      server()
        .post(`/public/${host.username}/${eventType.slug}/book`)
        .send({ start: overlapping, timezone: TZ, name: 'Pessoa B', email: 'b@exemplo.com' }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('o banco recusa a sobreposição mesmo com INSERT direto', async () => {
    // Prova de que a proteção não depende da camada de aplicação.
    const start = DateTime.fromISO(`${targetDate}T14:00`, { zone: TZ }).toJSDate();
    const end = DateTime.fromISO(`${targetDate}T15:00`, { zone: TZ }).toJSDate();
    const overlappingStart = DateTime.fromISO(`${targetDate}T14:30`, { zone: TZ }).toJSDate();
    const overlappingEnd = DateTime.fromISO(`${targetDate}T15:30`, { zone: TZ }).toJSDate();

    const base = {
      workspaceId: host.workspaceId,
      eventTypeId: eventType.id,
      hostUserId: host.userId,
      inviteeName: 'Direto',
      inviteeEmail: 'direto@exemplo.com',
      inviteeTimezone: TZ,
      eventNameSnapshot: 'Reunião',
      eventDurationSnapshot: 60,
      locationTypeSnapshot: 'NONE' as const,
      status: 'CONFIRMED' as const,
    };

    await ctx.prisma.booking.create({
      data: {
        ...base,
        startAt: start,
        endAt: end,
        blockedStartAt: start,
        blockedEndAt: end,
        cancelTokenHash: 'hash-cancel-1',
        rescheduleTokenHash: 'hash-reschedule-1',
      },
    });

    await expect(
      ctx.prisma.booking.create({
        data: {
          ...base,
          startAt: overlappingStart,
          endAt: overlappingEnd,
          blockedStartAt: overlappingStart,
          blockedEndAt: overlappingEnd,
          cancelTokenHash: 'hash-cancel-2',
          rescheduleTokenHash: 'hash-reschedule-2',
        },
      }),
    ).rejects.toThrow();

    // Cancelada, a primeira sai do índice parcial e o horário fica livre.
    await ctx.prisma.booking.updateMany({
      where: { cancelTokenHash: 'hash-cancel-1' },
      data: { status: 'CANCELLED' },
    });

    await expect(
      ctx.prisma.booking.create({
        data: {
          ...base,
          startAt: overlappingStart,
          endAt: overlappingEnd,
          blockedStartAt: overlappingStart,
          blockedEndAt: overlappingEnd,
          cancelTokenHash: 'hash-cancel-3',
          rescheduleTokenHash: 'hash-reschedule-3',
        },
      }),
    ).resolves.toBeDefined();
  });

  it('reserva em horários diferentes continua funcionando em paralelo', async () => {
    const response = await server()
      .get(`/public/${host.username}/${eventType.slug}/availability`)
      .query({ startDate: targetDate, endDate: targetDate, timezone: TZ })
      .expect(200);
    const slots = response.body.days[0].slots as { start: string }[];

    const [a, b] = await Promise.all([
      server()
        .post(`/public/${host.username}/${eventType.slug}/book`)
        .send({ start: slots[0].start, timezone: TZ, name: 'Pessoa A', email: 'a@exemplo.com' }),
      server()
        .post(`/public/${host.username}/${eventType.slug}/book`)
        .send({ start: slots[3].start, timezone: TZ, name: 'Pessoa B', email: 'b@exemplo.com' }),
    ]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
  });
});
