import { Injectable, Logger } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';
import { randomUUID } from 'node:crypto';
import {
  BusyInterval,
  CalendarCredentials,
  CalendarEventResult,
  CalendarProvider,
  CreateEventInput,
  FreeBusyQuery,
  ProviderCalendar,
  UpdateEventInput,
} from '../calendar-provider';
import { GoogleOAuthService } from './google-oauth.service';
import { ERROR_CODES, IntegrationUnavailableException } from '../../common/errors';

/** Erros que indicam autorização revogada/inválida. */
const REAUTH_STATUSES = new Set([401]);
/** Erros transitórios que valem uma nova tentativa. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

interface GoogleApiError extends Error {
  code?: number | string;
  status?: number;
  response?: { status?: number };
}

@Injectable()
export class GoogleCalendarProvider implements CalendarProvider {
  private readonly logger = new Logger(GoogleCalendarProvider.name);

  constructor(private readonly oauth: GoogleOAuthService) {}

  private async client(credentials: CalendarCredentials): Promise<calendar_v3.Calendar> {
    const auth = await this.oauth.getAuthorizedClient(credentials);
    return google.calendar({ version: 'v3', auth });
  }

  async listCalendars(credentials: CalendarCredentials): Promise<ProviderCalendar[]> {
    const calendar = await this.client(credentials);
    const response = await this.call(credentials, () => calendar.calendarList.list({ maxResults: 250 }));

    return (response.data.items ?? []).map((item) => ({
      id: item.id as string,
      name: item.summaryOverride ?? item.summary ?? item.id ?? 'Agenda',
      isPrimary: Boolean(item.primary),
      accessRole: item.accessRole ?? 'reader',
      timezone: item.timeZone ?? null,
    }));
  }

  /**
   * Free/Busy: devolve apenas blocos ocupado/livre.
   * Título, descrição e participantes dos compromissos do host nunca são
   * lidos nem armazenados (§9, §49, §58).
   */
  async getFreeBusy(
    credentials: CalendarCredentials,
    query: FreeBusyQuery,
  ): Promise<BusyInterval[]> {
    if (query.calendarIds.length === 0) return [];

    const calendar = await this.client(credentials);
    const response = await this.call(credentials, () =>
      calendar.freebusy.query({
        requestBody: {
          timeMin: query.timeMin.toISOString(),
          timeMax: query.timeMax.toISOString(),
          // Uma única chamada cobre todas as agendas marcadas (§67).
          items: query.calendarIds.map((id) => ({ id })),
        },
      }),
    );

    const calendars = response.data.calendars ?? {};
    const intervals: BusyInterval[] = [];

    for (const [calendarId, entry] of Object.entries(calendars)) {
      if (entry.errors?.length) {
        // Uma agenda inacessível não pode silenciosamente "liberar" horários.
        this.logger.warn(
          `Free/Busy indisponível para a agenda ${calendarId}: ${entry.errors
            .map((e) => e.reason)
            .join(', ')}`,
        );
        throw new IntegrationUnavailableException(
          ERROR_CODES.GOOGLE_UNAVAILABLE,
          'Não foi possível verificar a disponibilidade no Google Agenda.',
        );
      }
      for (const busy of entry.busy ?? []) {
        if (busy.start && busy.end) {
          intervals.push({ start: new Date(busy.start), end: new Date(busy.end) });
        }
      }
    }

    return intervals;
  }

  async createEvent(
    credentials: CalendarCredentials,
    input: CreateEventInput,
  ): Promise<CalendarEventResult> {
    const calendar = await this.client(credentials);

    const requestBody: calendar_v3.Schema$Event = {
      summary: input.summary,
      description: input.description,
      location: input.location ?? undefined,
      start: { dateTime: input.start.toISOString(), timeZone: input.timezone },
      end: { dateTime: input.end.toISOString(), timeZone: input.timezone },
      attendees: input.attendees.map((attendee) => ({
        email: attendee.email,
        displayName: attendee.displayName,
      })),
      extendedProperties: input.privateProperties
        ? { private: input.privateProperties }
        : undefined,
      // Uma sala nova por reserva: requestId único impede reaproveitamento (§11).
      conferenceData: input.createMeet
        ? {
            createRequest: {
              requestId: randomUUID(),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          }
        : undefined,
    };

    const response = await this.call(credentials, () =>
      calendar.events.insert({
        calendarId: input.calendarId,
        conferenceDataVersion: input.createMeet ? 1 : 0,
        sendUpdates: input.sendUpdates ? 'all' : 'none',
        requestBody,
      }),
    );

    return this.toResult(response.data);
  }

  async updateEvent(
    credentials: CalendarCredentials,
    input: UpdateEventInput,
  ): Promise<CalendarEventResult> {
    const calendar = await this.client(credentials);
    const response = await this.call(credentials, () =>
      calendar.events.patch({
        calendarId: input.calendarId,
        eventId: input.eventId,
        sendUpdates: input.sendUpdates ? 'all' : 'none',
        requestBody: {
          ...(input.summary ? { summary: input.summary } : {}),
          ...(input.description ? { description: input.description } : {}),
          start: { dateTime: input.start.toISOString(), timeZone: input.timezone },
          end: { dateTime: input.end.toISOString(), timeZone: input.timezone },
        },
      }),
    );
    return this.toResult(response.data);
  }

  async deleteEvent(
    credentials: CalendarCredentials,
    calendarId: string,
    eventId: string,
    sendUpdates: boolean,
  ): Promise<void> {
    const calendar = await this.client(credentials);
    await this.execute(
      credentials,
      () =>
        calendar.events.delete({
          calendarId,
          eventId,
          sendUpdates: sendUpdates ? 'all' : 'none',
        }),
      // 404/410: o evento já não existe no Google — para um cancelamento,
      // esse é exatamente o estado desejado, então tratamos como sucesso.
      { tolerate: [404, 410] },
    );
  }

  private toResult(event: calendar_v3.Schema$Event): CalendarEventResult {
    const meetUrl =
      event.hangoutLink ??
      event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri ??
      null;

    return {
      eventId: event.id as string,
      meetUrl,
      htmlLink: event.htmlLink ?? null,
    };
  }

  private statusOf(error: GoogleApiError): number | undefined {
    const raw = error.response?.status ?? error.status ?? error.code;
    return typeof raw === 'number' ? raw : undefined;
  }

  /**
   * Envolve a chamada ao Google com tratamento de erro consistente (§12):
   * 401 -> marca reautenticação necessária (sem loop de retry);
   * 403/404 -> erro de permissão/recurso, propagado sem retry;
   * 429/5xx -> até 3 tentativas com backoff exponencial e jitter.
   */
  private async call<T>(credentials: CalendarCredentials, operation: () => Promise<T>): Promise<T> {
    return (await this.execute(credentials, operation)) as T;
  }

  /**
   * Variante que aceita status "esperados" (ex.: 404 ao cancelar um evento
   * que já não existe) e devolve undefined nesses casos.
   */
  private async execute<T>(
    credentials: CalendarCredentials,
    operation: () => Promise<T>,
    options: { tolerate?: number[] } = {},
  ): Promise<T | undefined> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const status = this.statusOf(error as GoogleApiError);

        if (status && options.tolerate?.includes(status)) return undefined;

        if (status && REAUTH_STATUSES.has(status)) {
          await this.oauth.markReauthRequired(credentials.connectionId);
          throw new IntegrationUnavailableException(
            ERROR_CODES.GOOGLE_REAUTH_REQUIRED,
            'Sua conexão com o Google Agenda precisa ser renovada.',
          );
        }

        if (!status || !RETRYABLE_STATUSES.has(status) || attempt === MAX_ATTEMPTS) {
          break;
        }

        const delay = 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
        this.logger.warn(
          `Google respondeu ${status}; tentativa ${attempt}/${MAX_ATTEMPTS} em ${delay}ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    const status = this.statusOf(lastError as GoogleApiError);
    if (status === 403) {
      throw new IntegrationUnavailableException(
        ERROR_CODES.GOOGLE_UNAVAILABLE,
        'O Google recusou a operação nesta agenda. Verifique as permissões concedidas.',
      );
    }

    this.logger.error(
      `Falha na chamada ao Google Calendar (status ${status ?? 'desconhecido'}).`,
      (lastError as Error)?.stack,
    );
    throw new IntegrationUnavailableException(
      ERROR_CODES.GOOGLE_UNAVAILABLE,
      'O Google Agenda está temporariamente indisponível. Tente novamente em instantes.',
    );
  }
}
