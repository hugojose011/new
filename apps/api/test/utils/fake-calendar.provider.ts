import {
  BusyInterval,
  CalendarCredentials,
  CalendarEventResult,
  CalendarProvider,
  CreateEventInput,
  FreeBusyQuery,
  ProviderCalendar,
  UpdateEventInput,
} from '../../src/integrations/calendar-provider';

/**
 * Implementação em memória do CalendarProvider (§70).
 *
 * Nenhum teste toca a API real do Google: o adaptador é substituído por esta
 * classe, que registra as chamadas e permite simular falhas.
 */
export class FakeCalendarProvider implements CalendarProvider {
  busy: BusyInterval[] = [];
  calendars: ProviderCalendar[] = [
    { id: 'primary', name: 'Agenda principal', isPrimary: true, accessRole: 'owner', timezone: 'America/Sao_Paulo' },
  ];

  readonly events = new Map<string, CreateEventInput & { eventId: string; meetUrl: string | null }>();
  readonly deleted: string[] = [];
  readonly updates: UpdateEventInput[] = [];

  /** Quando definido, a próxima chamada correspondente lança este erro. */
  failCreateWith: Error | null = null;
  failUpdateWith: Error | null = null;
  failFreeBusyWith: Error | null = null;

  private sequence = 0;

  async listCalendars(): Promise<ProviderCalendar[]> {
    return this.calendars;
  }

  async getFreeBusy(_c: CalendarCredentials, query: FreeBusyQuery): Promise<BusyInterval[]> {
    if (this.failFreeBusyWith) throw this.failFreeBusyWith;
    return this.busy.filter(
      (interval) => interval.end > query.timeMin && interval.start < query.timeMax,
    );
  }

  async createEvent(_c: CalendarCredentials, input: CreateEventInput): Promise<CalendarEventResult> {
    if (this.failCreateWith) throw this.failCreateWith;

    this.sequence += 1;
    const eventId = `evt-${this.sequence}`;
    // Uma sala nova por reserva, como a API real (§11).
    const meetUrl = input.createMeet ? `https://meet.google.com/fake-${this.sequence}` : null;

    this.events.set(eventId, { ...input, eventId, meetUrl });
    return { eventId, meetUrl, htmlLink: `https://calendar.google.com/${eventId}` };
  }

  async updateEvent(_c: CalendarCredentials, input: UpdateEventInput): Promise<CalendarEventResult> {
    if (this.failUpdateWith) throw this.failUpdateWith;

    this.updates.push(input);
    const existing = this.events.get(input.eventId);
    if (existing) {
      existing.start = input.start;
      existing.end = input.end;
    }
    return {
      eventId: input.eventId,
      meetUrl: existing?.meetUrl ?? null,
      htmlLink: null,
    };
  }

  async deleteEvent(
    _c: CalendarCredentials,
    _calendarId: string,
    eventId: string,
  ): Promise<void> {
    this.deleted.push(eventId);
    this.events.delete(eventId);
  }

  reset(): void {
    this.busy = [];
    this.events.clear();
    this.deleted.length = 0;
    this.updates.length = 0;
    this.failCreateWith = null;
    this.failUpdateWith = null;
    this.failFreeBusyWith = null;
  }
}
