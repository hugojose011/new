import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';

export interface HostSession {
  userId: string;
  workspaceId: string;
  cookies: string[];
  csrfToken: string;
  username: string;
}

/** Cria um host autenticado com username e schedule padrão. */
export async function createHost(
  app: INestApplication,
  prisma: PrismaClient,
  options: { email?: string; username?: string; timezone?: string } = {},
): Promise<HostSession> {
  const email = options.email ?? `host-${Date.now()}-${Math.random().toString(36).slice(2)}@test.dev`;
  const username = options.username ?? `host${Math.random().toString(36).slice(2, 8)}`;
  const timezone = options.timezone ?? 'America/Sao_Paulo';

  const response = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: 'Host de Teste', email, password: 'senha-de-teste-123', timezone })
    .expect(201);

  const cookies = extractCookies(response);
  const csrfToken = readCookie(cookies, 'agenda_csrf');

  await request(app.getHttpServer())
    .put('/users/me')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({ username })
    .expect(200);

  return {
    userId: response.body.id,
    workspaceId: response.body.workspaceId,
    cookies,
    csrfToken,
    username,
  };
}

/** Conecta uma "conta Google" fictícia com agenda de conflito e destino. */
export async function connectFakeGoogle(
  prisma: PrismaClient,
  userId: string,
): Promise<{ connectionId: string }> {
  const connection = await prisma.calendarConnection.create({
    data: {
      userId,
      provider: 'GOOGLE',
      providerAccountId: `google-${userId}`,
      accountEmail: 'host@gmail.test',
      // Valores cifrados reais não são necessários: o provedor é substituído
      // pelo FakeCalendarProvider, que não decripta nada.
      encryptedRefreshToken: 'v1.fake.fake.fake',
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
      status: 'CONNECTED',
      calendars: {
        create: {
          providerCalendarId: 'primary',
          name: 'Agenda principal',
          isPrimary: true,
          accessRole: 'owner',
          checkConflicts: true,
          isBookingDestination: true,
        },
      },
    },
  });
  return { connectionId: connection.id };
}

export async function createEventType(
  app: INestApplication,
  host: HostSession,
  overrides: Record<string, unknown> = {},
) {
  const response = await request(app.getHttpServer())
    .post('/event-types')
    .set('Cookie', host.cookies)
    .set('x-csrf-token', host.csrfToken)
    .send({
      name: 'Reunião de Demonstração',
      slug: 'demonstracao',
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      locationType: 'GOOGLE_MEET',
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 0,
      bookingWindowDays: 60,
      ...overrides,
    })
    .expect(201);
  return response.body;
}

export function extractCookies(response: request.Response): string[] {
  const raw = response.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export function readCookie(cookies: string[], name: string): string {
  for (const cookie of cookies) {
    const match = new RegExp(`${name}=([^;]+)`).exec(cookie);
    if (match) return decodeURIComponent(match[1]);
  }
  throw new Error(`Cookie ${name} não encontrado.`);
}
