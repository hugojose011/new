/**
 * Porta (interface) do provedor de calendário.
 *
 * O domínio de agendamento depende só desta interface — nunca da googleapis.
 * Isso permite (a) mockar o provedor nos testes sem tocar a rede (§70) e
 * (b) adicionar Outlook/Teams no futuro sem reescrever BookingsService (§85).
 */

export interface FreeBusyQuery {
  calendarIds: string[];
  timeMin: Date;
  timeMax: Date;
}

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface CreateEventInput {
  calendarId: string;
  summary: string;
  description: string;
  start: Date;
  end: Date;
  /** Timezone IANA usado na representação do evento. */
  timezone: string;
  attendees: { email: string; displayName?: string }[];
  /** Solicita a criação de uma sala do Meet exclusiva para esta reserva. */
  createMeet: boolean;
  /** Metadados privados para correlacionar com os registros internos (§94). */
  privateProperties?: Record<string, string>;
  location?: string | null;
  /** Se o provedor deve notificar os participantes por e-mail. */
  sendUpdates: boolean;
}

export interface UpdateEventInput {
  calendarId: string;
  eventId: string;
  start: Date;
  end: Date;
  timezone: string;
  summary?: string;
  description?: string;
  sendUpdates: boolean;
}

export interface CalendarEventResult {
  eventId: string;
  meetUrl: string | null;
  htmlLink: string | null;
}

export interface ProviderCalendar {
  id: string;
  name: string;
  isPrimary: boolean;
  accessRole: string;
  timezone: string | null;
}

/** Contexto de autenticação de um host específico. */
export interface CalendarCredentials {
  connectionId: string;
  userId: string;
}

export interface CalendarProvider {
  listCalendars(credentials: CalendarCredentials): Promise<ProviderCalendar[]>;
  getFreeBusy(credentials: CalendarCredentials, query: FreeBusyQuery): Promise<BusyInterval[]>;
  createEvent(
    credentials: CalendarCredentials,
    input: CreateEventInput,
  ): Promise<CalendarEventResult>;
  updateEvent(
    credentials: CalendarCredentials,
    input: UpdateEventInput,
  ): Promise<CalendarEventResult>;
  deleteEvent(
    credentials: CalendarCredentials,
    calendarId: string,
    eventId: string,
    sendUpdates: boolean,
  ): Promise<void>;
}

export const CALENDAR_PROVIDER = 'CALENDAR_PROVIDER';
