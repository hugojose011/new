import request from 'supertest';
import { DateTime } from 'luxon';
import { createTestApp, resetDatabase, TestContext } from './utils/test-app';
import { connectFakeGoogle, createEventType, createHost, HostSession } from './utils/fixtures';

/**
 * Cobre o cenário de aceite ponta a ponta no nível da API:
 * link público -> horários -> reserva -> Google -> dashboard -> cancelar ->
 * horário volta -> reagendar.
 */
describe('Fluxo de agendamento (integração)', () => {
  let ctx: TestContext;
  let host: HostSession;
  let eventType: { id: string; slug: string };

  const TZ = 'America/Sao_Paulo';
  /** Próxima terça-feira, para cair dentro do horário comercial padrão. */
  const targetDate = DateTime.now()
    .setZone(TZ)
    .plus({ days: 7 })
    .set({ weekday: 2 })
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
    eventType = await createEventType(ctx.app, host);
  });

  const server = () => request(ctx.app.getHttpServer());

  async function availability(date = targetDate) {
    const response = await server()
      .get(`/public/${host.username}/${eventType.slug}/availability`)
      .query({ startDate: date, endDate: date, timezone: TZ })
      .expect(200);
    return response.body.days[0].slots as { start: string; end: string }[];
  }

  function book(start: string, extra: Record<string, unknown> = {}) {
    return server()
      .post(`/public/${host.username}/${eventType.slug}/book`)
      .send({
        start,
        timezone: TZ,
        name: 'João Silva',
        email: 'joao@exemplo.com',
        ...extra,
      });
  }

  it('expõe a página pública sem exigir conta', async () => {
    const response = await server()
      .get(`/public/${host.username}/${eventType.slug}`)
      .expect(200);

    expect(response.body.name).toBe('Reunião de Demonstração');
    expect(response.body.host.username).toBe(host.username);
    expect(response.body.durationMinutes).toBe(30);
  });

  it('lista horários e nunca revela por que um horário está ocupado', async () => {
    // Compromisso particular no Google das 10h às 11h.
    const busyStart = DateTime.fromISO(`${targetDate}T10:00`, { zone: TZ });
    ctx.calendar.busy = [
      { start: busyStart.toJSDate(), end: busyStart.plus({ hours: 1 }).toJSDate() },
    ];

    const slots = await availability();
    const localTimes = slots.map((slot) => DateTime.fromISO(slot.start).setZone(TZ).toFormat('HH:mm'));

    expect(localTimes).toContain('09:00');
    expect(localTimes).not.toContain('10:00');
    expect(localTimes).not.toContain('10:30');
    expect(localTimes).toContain('11:00');
    // A resposta contém apenas início/fim — nenhum dado do compromisso.
    expect(Object.keys(slots[0])).toEqual(['start', 'end']);
  });

  it('cria a reserva, o evento no Google e o Meet exclusivo', async () => {
    const slots = await availability();
    const response = await book(slots[0].start).expect(201);

    expect(response.body.status).toBe('CONFIRMED');
    expect(response.body.meetUrl).toMatch(/^https:\/\/meet\.google\.com\//);
    expect(response.body.cancelUrl).toContain('/agendamento/cancelar/');

    const [event] = [...ctx.calendar.events.values()];
    expect(event.summary).toBe('Reunião de Demonstração — João Silva');
    expect(event.attendees).toEqual([
      { email: 'joao@exemplo.com', displayName: 'João Silva' },
    ]);
    expect(event.privateProperties?.bookingId).toBe(response.body.id);
    expect(event.createMeet).toBe(true);

    const booking = await ctx.prisma.booking.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(booking.googleEventId).toBe(event.eventId);
    // Tokens só existem como hash no banco.
    expect(booking.cancelTokenHash).toHaveLength(64);
  });

  it('gera uma sala do Meet diferente para cada reserva', async () => {
    const slots = await availability();
    const first = await book(slots[0].start).expect(201);
    const second = await book(slots[1].start, { email: 'maria@exemplo.com' }).expect(201);

    expect(first.body.meetUrl).not.toBe(second.body.meetUrl);
  });

  it('bloqueia o horário reservado e devolve 409 na segunda tentativa', async () => {
    const slots = await availability();
    await book(slots[0].start).expect(201);

    const conflict = await book(slots[0].start, { email: 'outra@exemplo.com' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('SLOT_UNAVAILABLE');

    const remaining = await availability();
    expect(remaining.map((slot) => slot.start)).not.toContain(slots[0].start);
  });

  it('trata a chave de idempotência sem duplicar a reserva', async () => {
    const slots = await availability();
    const key = 'chave-idempotente-1';

    const first = await book(slots[0].start, { idempotencyKey: key }).expect(201);
    const second = await book(slots[0].start, { idempotencyKey: key }).expect(201);

    expect(second.body.id).toBe(first.body.id);
    expect(await ctx.prisma.booking.count()).toBe(1);
  });

  it('respeita os buffers ao liberar horários vizinhos', async () => {
    await ctx.prisma.eventType.update({
      where: { id: eventType.id },
      data: { bufferBeforeMinutes: 15, bufferAfterMinutes: 15 },
    });

    const slots = await availability();
    const chosen = slots.find(
      (slot) => DateTime.fromISO(slot.start).setZone(TZ).toFormat('HH:mm') === '10:00',
    );
    await book(chosen!.start).expect(201);

    const after = await availability();
    const times = after.map((slot) => DateTime.fromISO(slot.start).setZone(TZ).toFormat('HH:mm'));
    // 10:00-10:30 ocupado; buffers de 15 min dos dois lados derrubam 09:30 e 10:30.
    expect(times).not.toContain('09:30');
    expect(times).not.toContain('10:00');
    expect(times).not.toContain('10:30');
    expect(times).toContain('09:00');
    expect(times).toContain('11:00');
  });

  it('recusa o agendamento quando o Google falha, sem deixar reserva confirmada', async () => {
    const slots = await availability();
    ctx.calendar.failCreateWith = new Error('Google fora do ar');

    const response = await book(slots[0].start);
    expect(response.status).toBe(503);

    const booking = await ctx.prisma.booking.findFirstOrThrow({});
    expect(booking.status).toBe('FAILED');

    // O horário precisa voltar a ficar livre para uma nova tentativa (§95).
    ctx.calendar.failCreateWith = null;
    const retry = await availability();
    expect(retry.map((slot) => slot.start)).toContain(slots[0].start);
    await book(slots[0].start).expect(201);
  });

  it('mostra a reserva no dashboard do host', async () => {
    const slots = await availability();
    const booking = await book(slots[0].start).expect(201);

    const list = await server()
      .get('/bookings')
      .query({ filter: 'upcoming' })
      .set('Cookie', host.cookies)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(booking.body.id);
    expect(list.body[0].inviteeName).toBe('João Silva');

    const summary = await server().get('/bookings/summary').set('Cookie', host.cookies).expect(200);
    expect(summary.body.next7DaysCount).toBeGreaterThanOrEqual(0);
    expect(summary.body.google.status).toBe('CONNECTED');
  });

  it('cancela pelo link público, remove o evento do Google e libera o horário', async () => {
    const slots = await availability();
    const booking = await book(slots[0].start).expect(201);
    const token = (booking.body.cancelUrl as string).split('/').pop() as string;

    const details = await server().get(`/booking/cancel/${token}`).expect(200);
    expect(details.body.eventName).toBe('Reunião de Demonstração');

    const cancelled = await server().post(`/booking/cancel/${token}`).send({}).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(ctx.calendar.deleted).toHaveLength(1);
    expect(ctx.calendar.events.size).toBe(0);

    // Cancelamento é idempotente.
    await server().post(`/booking/cancel/${token}`).send({}).expect(200);

    const after = await availability();
    expect(after.map((slot) => slot.start)).toContain(slots[0].start);
  });

  it('reagenda: novo horário ocupa, anterior fica livre e o evento é atualizado', async () => {
    const slots = await availability();
    const booking = await book(slots[0].start).expect(201);
    const token = (booking.body.rescheduleUrl as string).split('/').pop() as string;

    const target = slots[2];
    const result = await server()
      .post(`/booking/reschedule/${token}`)
      .send({ start: target.start, timezone: TZ })
      .expect(200);

    expect(result.body.startAt).toBe(DateTime.fromISO(target.start).toUTC().toISO({ suppressMilliseconds: false }));
    expect(ctx.calendar.updates).toHaveLength(1);

    const after = await availability();
    const starts = after.map((slot) => slot.start);
    expect(starts).toContain(slots[0].start); // horário antigo liberado
    expect(starts).not.toContain(target.start); // novo horário ocupado

    const history = await ctx.prisma.bookingHistory.findMany({
      where: { bookingId: booking.body.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((entry) => entry.action)).toContain('RESCHEDULED');
  });

  it('recusa reagendar para um horário já ocupado', async () => {
    const slots = await availability();
    const first = await book(slots[0].start).expect(201);
    await book(slots[1].start, { email: 'maria@exemplo.com' }).expect(201);

    const token = (first.body.rescheduleUrl as string).split('/').pop() as string;
    const response = await server()
      .post(`/booking/reschedule/${token}`)
      .send({ start: slots[1].start, timezone: TZ });

    expect(response.status).toBe(409);
  });

  it('rejeita horário fora da disponibilidade configurada', async () => {
    const midnight = DateTime.fromISO(`${targetDate}T03:00`, { zone: TZ }).toISO() as string;
    const response = await book(midnight);
    expect(response.status).toBe(409);
  });

  it('exige as perguntas obrigatórias', async () => {
    const withQuestion = await createEventType(ctx.app, host, {
      name: 'Consultoria',
      slug: 'consultoria',
      questions: [
        { label: 'Qual é a sua empresa?', type: 'TEXT', required: true, order: 0 },
      ],
    });

    const response = await server()
      .get(`/public/${host.username}/${withQuestion.slug}/availability`)
      .query({ startDate: targetDate, endDate: targetDate, timezone: TZ })
      .expect(200);
    const slot = response.body.days[0].slots[0];

    const missing = await server()
      .post(`/public/${host.username}/${withQuestion.slug}/book`)
      .send({ start: slot.start, timezone: TZ, name: 'João', email: 'joao@exemplo.com' });
    expect(missing.status).toBe(400);

    const ok = await server()
      .post(`/public/${host.username}/${withQuestion.slug}/book`)
      .send({
        start: slot.start,
        timezone: TZ,
        name: 'João',
        email: 'joao@exemplo.com',
        answers: [{ questionId: withQuestion.questions[0].id, answer: 'Acme' }],
      })
      .expect(201);

    const answers = await ctx.prisma.bookingAnswer.findMany({ where: { bookingId: ok.body.id } });
    expect(answers[0].questionLabelSnapshot).toBe('Qual é a sua empresa?');
  });

  it('não permite ver agendamentos de outro host', async () => {
    const slots = await availability();
    const booking = await book(slots[0].start).expect(201);

    const other = await createHost(ctx.app, ctx.prisma);
    await server()
      .get(`/bookings/${booking.body.id}`)
      .set('Cookie', other.cookies)
      .expect(404);
  });

  it('exige sessão nas rotas do host', async () => {
    await server().get('/bookings').expect(401);
  });

  it('exige token CSRF em mutações autenticadas', async () => {
    await server()
      .post('/event-types')
      .set('Cookie', host.cookies)
      .send({ name: 'Sem CSRF', durationMinutes: 30, locationType: 'NONE' })
      .expect(403);
  });
});
