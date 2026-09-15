import { expect, test } from '@playwright/test';
import { DateTime } from 'luxon';

/**
 * Fluxos críticos ponta a ponta (§71).
 *
 * Pré-requisitos (ver README):
 *   - API em E2E_API_URL com um banco de testes migrado;
 *   - Web em E2E_WEB_URL;
 *   - as duas apontando para o mesmo banco.
 *
 * O teste cria o próprio host, tipo de evento e reservas — não depende de seed.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:3333';
const TZ = 'America/Sao_Paulo';

const unique = Date.now().toString(36);
const HOST = {
  name: 'Host E2E',
  email: `e2e-${unique}@teste.dev`,
  password: 'senha-de-teste-12345',
  username: `e2e${unique}`,
};

/** Próximo dia útil a partir de amanhã, no fuso do host. */
function nextWeekday(): string {
  let day = DateTime.now().setZone(TZ).plus({ days: 1 });
  while (day.weekday > 5) day = day.plus({ days: 1 });
  return day.toISODate() as string;
}

test.describe('Agendamento ponta a ponta', () => {
  let cookies = '';
  let csrf = '';
  let eventSlug = '';

  test.beforeAll(async ({ request }) => {
    const register = await request.post(`${API}/auth/register`, {
      // O username não faz parte do cadastro: é definido logo depois, no perfil.
      data: { name: HOST.name, email: HOST.email, password: HOST.password, timezone: TZ },
    });
    expect(register.ok()).toBeTruthy();

    const setCookie = register.headersArray().filter((header) => header.name.toLowerCase() === 'set-cookie');
    cookies = setCookie.map((header) => header.value.split(';')[0]).join('; ');
    csrf = /agenda_csrf=([^;]+)/.exec(cookies)?.[1] ?? '';

    const headers = { Cookie: cookies, 'x-csrf-token': csrf };

    await request.put(`${API}/users/me`, {
      headers,
      data: { username: HOST.username },
    });

    const eventType = await request.post(`${API}/event-types`, {
      headers,
      data: {
        name: 'Conversa E2E',
        slug: `conversa-${unique}`,
        durationMinutes: 30,
        slotIntervalMinutes: 30,
        // Sem Google conectado o evento não pode exigir Meet.
        locationType: 'NONE',
        minimumNoticeMinutes: 0,
        bookingWindowDays: 60,
      },
    });
    expect(eventType.ok()).toBeTruthy();
    eventSlug = (await eventType.json()).slug;
  });

  test('visitante agenda, host vê no dashboard, visitante cancela e o horário volta', async ({
    page,
    request,
  }) => {
    const date = nextWeekday();

    await page.goto(`/${HOST.username}/${eventSlug}`);
    await expect(page.getByRole('heading', { name: 'Conversa E2E' })).toBeVisible();

    // Seleciona o dia e o primeiro horário livre.
    const dayNumber = DateTime.fromISO(date).day;
    await page.getByRole('button', { name: new RegExp(`^${dayNumber} de `) }).click();

    const firstSlot = page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first();
    const chosenTime = (await firstSlot.textContent())?.trim();
    await firstSlot.click();

    await page.getByLabel('Nome').fill('Visitante E2E');
    await page.getByLabel('E-mail').fill('visitante@teste.dev');
    await page.getByRole('button', { name: 'Confirmar agendamento' }).click();

    await expect(page.getByRole('heading', { name: 'Agendamento confirmado' })).toBeVisible();
    const cancelUrl = await page.getByRole('link', { name: 'Cancelar' }).getAttribute('href');
    expect(cancelUrl).toBeTruthy();

    // O horário escolhido some da lista pública.
    await page.goto(`/${HOST.username}/${eventSlug}`);
    await page.getByRole('button', { name: new RegExp(`^${dayNumber} de `) }).click();
    await expect(page.getByRole('button', { name: chosenTime as string })).toHaveCount(0);

    // O host enxerga a reserva.
    const bookings = await request.get(`${API}/bookings?filter=upcoming`, {
      headers: { Cookie: cookies },
    });
    const list = await bookings.json();
    expect(list.some((booking: { inviteeName: string }) => booking.inviteeName === 'Visitante E2E')).toBe(
      true,
    );

    // O visitante cancela pelo link seguro.
    await page.goto(cancelUrl as string);
    await page.getByRole('button', { name: 'Confirmar cancelamento' }).click();
    await expect(page.getByRole('heading', { name: 'Agendamento cancelado' })).toBeVisible();

    // E o horário volta a aparecer.
    await page.goto(`/${HOST.username}/${eventSlug}`);
    await page.getByRole('button', { name: new RegExp(`^${dayNumber} de `) }).click();
    await expect(page.getByRole('button', { name: chosenTime as string })).toBeVisible();
  });

  test('agendar, reagendar e o horário anterior ficar livre', async ({ page }) => {
    const date = nextWeekday();
    const dayNumber = DateTime.fromISO(date).day;

    await page.goto(`/${HOST.username}/${eventSlug}`);
    await page.getByRole('button', { name: new RegExp(`^${dayNumber} de `) }).click();

    const slots = page.getByRole('button', { name: /^\d{2}:\d{2}$/ });
    const originalTime = (await slots.first().textContent())?.trim() as string;
    await slots.first().click();

    await page.getByLabel('Nome').fill('Pessoa Reagenda');
    await page.getByLabel('E-mail').fill('reagenda@teste.dev');
    await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
    await expect(page.getByRole('heading', { name: 'Agendamento confirmado' })).toBeVisible();

    const rescheduleUrl = await page.getByRole('link', { name: 'Reagendar' }).getAttribute('href');
    await page.goto(rescheduleUrl as string);

    await page.getByRole('button', { name: new RegExp(`^${dayNumber} de `) }).click();
    const newSlots = page.getByRole('button', { name: /^\d{2}:\d{2}$/ });
    const newTime = (await newSlots.first().textContent())?.trim() as string;
    expect(newTime).not.toBe(originalTime);
    await newSlots.first().click();

    await expect(page.getByRole('heading', { name: 'Agendamento reagendado' })).toBeVisible();

    // Horário anterior livre, novo horário ocupado.
    await page.goto(`/${HOST.username}/${eventSlug}`);
    await page.getByRole('button', { name: new RegExp(`^${dayNumber} de `) }).click();
    await expect(page.getByRole('button', { name: originalTime })).toBeVisible();
    await expect(page.getByRole('button', { name: newTime })).toHaveCount(0);
  });
});
