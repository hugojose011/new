import { GoogleCalendarProvider } from './google-calendar.provider';
import { GoogleOAuthService } from './google-oauth.service';
import { IntegrationUnavailableException } from '../../common/errors';

const calendarApi = {
  calendarList: { list: jest.fn() },
  freebusy: { query: jest.fn() },
  events: { insert: jest.fn(), patch: jest.fn(), delete: jest.fn() },
};

jest.mock('googleapis', () => ({
  google: {
    calendar: () => calendarApi,
    auth: { OAuth2: class {} },
  },
}));

function googleError(status: number): Error & { status: number } {
  return Object.assign(new Error(`Google respondeu ${status}`), { status });
}

describe('GoogleCalendarProvider', () => {
  let provider: GoogleCalendarProvider;
  let oauth: jest.Mocked<Pick<GoogleOAuthService, 'getAuthorizedClient' | 'markReauthRequired'>>;
  const credentials = { connectionId: 'conn-1', userId: 'user-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as never);

    oauth = {
      getAuthorizedClient: jest.fn().mockResolvedValue({}),
      markReauthRequired: jest.fn().mockResolvedValue(undefined),
    };
    provider = new GoogleCalendarProvider(oauth as unknown as GoogleOAuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lista as agendas da conta', async () => {
    calendarApi.calendarList.list.mockResolvedValue({
      data: {
        items: [
          { id: 'primary', summary: 'Pessoal', primary: true, accessRole: 'owner', timeZone: 'America/Sao_Paulo' },
          { id: 'feriados', summary: 'Feriados', accessRole: 'reader' },
        ],
      },
    });

    const calendars = await provider.listCalendars(credentials);
    expect(calendars).toEqual([
      { id: 'primary', name: 'Pessoal', isPrimary: true, accessRole: 'owner', timezone: 'America/Sao_Paulo' },
      { id: 'feriados', name: 'Feriados', isPrimary: false, accessRole: 'reader', timezone: null },
    ]);
  });

  it('consulta free/busy de várias agendas em uma única chamada', async () => {
    calendarApi.freebusy.query.mockResolvedValue({
      data: {
        calendars: {
          primary: { busy: [{ start: '2026-10-05T12:00:00Z', end: '2026-10-05T13:00:00Z' }] },
          trabalho: { busy: [{ start: '2026-10-05T15:00:00Z', end: '2026-10-05T16:00:00Z' }] },
        },
      },
    });

    const busy = await provider.getFreeBusy(credentials, {
      calendarIds: ['primary', 'trabalho'],
      timeMin: new Date('2026-10-05T00:00:00Z'),
      timeMax: new Date('2026-10-06T00:00:00Z'),
    });

    expect(calendarApi.freebusy.query).toHaveBeenCalledTimes(1);
    expect(busy).toHaveLength(2);
    expect(busy[0].start.toISOString()).toBe('2026-10-05T12:00:00.000Z');
  });

  it('não consulta o Google quando não há agendas marcadas', async () => {
    const busy = await provider.getFreeBusy(credentials, {
      calendarIds: [],
      timeMin: new Date(),
      timeMax: new Date(),
    });
    expect(busy).toEqual([]);
    expect(calendarApi.freebusy.query).not.toHaveBeenCalled();
  });

  it('falha (em vez de liberar horários) quando uma agenda retorna erro', async () => {
    calendarApi.freebusy.query.mockResolvedValue({
      data: { calendars: { primary: { errors: [{ reason: 'notFound' }] } } },
    });

    await expect(
      provider.getFreeBusy(credentials, {
        calendarIds: ['primary'],
        timeMin: new Date(),
        timeMax: new Date(),
      }),
    ).rejects.toBeInstanceOf(IntegrationUnavailableException);
  });

  it('cria o evento com Meet e propriedades privadas', async () => {
    calendarApi.events.insert.mockResolvedValue({
      data: {
        id: 'evt-1',
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
        htmlLink: 'https://calendar.google.com/evt-1',
      },
    });

    const result = await provider.createEvent(credentials, {
      calendarId: 'primary',
      summary: 'Demo — João',
      description: 'detalhes',
      start: new Date('2026-10-05T12:00:00Z'),
      end: new Date('2026-10-05T12:30:00Z'),
      timezone: 'America/Sao_Paulo',
      attendees: [{ email: 'joao@exemplo.com', displayName: 'João' }],
      createMeet: true,
      privateProperties: { bookingId: 'b-1' },
      sendUpdates: true,
    });

    expect(result).toEqual({
      eventId: 'evt-1',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
      htmlLink: 'https://calendar.google.com/evt-1',
    });

    const call = calendarApi.events.insert.mock.calls[0][0];
    expect(call.conferenceDataVersion).toBe(1);
    expect(call.sendUpdates).toBe('all');
    expect(call.requestBody.conferenceData.createRequest.conferenceSolutionKey.type).toBe(
      'hangoutsMeet',
    );
    expect(call.requestBody.extendedProperties.private).toEqual({ bookingId: 'b-1' });
  });

  it('usa um requestId novo a cada reserva (nunca reaproveita a sala)', async () => {
    calendarApi.events.insert.mockResolvedValue({ data: { id: 'evt', hangoutLink: null } });
    const input = {
      calendarId: 'primary',
      summary: 'x',
      description: 'y',
      start: new Date(),
      end: new Date(),
      timezone: 'UTC',
      attendees: [],
      createMeet: true,
      sendUpdates: false,
    };

    await provider.createEvent(credentials, input);
    await provider.createEvent(credentials, input);

    const [first, second] = calendarApi.events.insert.mock.calls.map(
      (call) => call[0].requestBody.conferenceData.createRequest.requestId,
    );
    expect(first).not.toBe(second);
  });

  it('marca reautenticação necessária quando o token foi revogado (401)', async () => {
    calendarApi.events.insert.mockRejectedValue(googleError(401));

    await expect(
      provider.createEvent(credentials, {
        calendarId: 'primary',
        summary: 'x',
        description: 'y',
        start: new Date(),
        end: new Date(),
        timezone: 'UTC',
        attendees: [],
        createMeet: false,
        sendUpdates: false,
      }),
    ).rejects.toMatchObject({ response: { code: 'GOOGLE_REAUTH_REQUIRED' } });

    expect(oauth.markReauthRequired).toHaveBeenCalledWith('conn-1');
    // 401 nunca entra em loop de retry.
    expect(calendarApi.events.insert).toHaveBeenCalledTimes(1);
  });

  it('tenta novamente em 429 e desiste após o limite', async () => {
    calendarApi.calendarList.list.mockRejectedValue(googleError(429));

    await expect(provider.listCalendars(credentials)).rejects.toBeInstanceOf(
      IntegrationUnavailableException,
    );
    expect(calendarApi.calendarList.list).toHaveBeenCalledTimes(3);
  });

  it('tenta novamente em 503 e sucede na segunda tentativa', async () => {
    calendarApi.calendarList.list
      .mockRejectedValueOnce(googleError(503))
      .mockResolvedValueOnce({ data: { items: [] } });

    await expect(provider.listCalendars(credentials)).resolves.toEqual([]);
    expect(calendarApi.calendarList.list).toHaveBeenCalledTimes(2);
  });

  it('não tenta novamente em 403', async () => {
    calendarApi.calendarList.list.mockRejectedValue(googleError(403));

    await expect(provider.listCalendars(credentials)).rejects.toBeInstanceOf(
      IntegrationUnavailableException,
    );
    expect(calendarApi.calendarList.list).toHaveBeenCalledTimes(1);
  });

  it('cancelar um evento que já não existe (404) é silencioso', async () => {
    calendarApi.events.delete.mockRejectedValue(googleError(404));
    await expect(
      provider.deleteEvent(credentials, 'primary', 'evt-1', true),
    ).resolves.toBeUndefined();
  });

  it('atualiza o evento ao reagendar mantendo o mesmo id', async () => {
    calendarApi.events.patch.mockResolvedValue({
      data: { id: 'evt-1', hangoutLink: 'https://meet.google.com/abc' },
    });

    const result = await provider.updateEvent(credentials, {
      calendarId: 'primary',
      eventId: 'evt-1',
      start: new Date('2026-10-06T12:00:00Z'),
      end: new Date('2026-10-06T12:30:00Z'),
      timezone: 'America/Sao_Paulo',
      sendUpdates: true,
    });

    expect(result.eventId).toBe('evt-1');
    expect(calendarApi.events.patch.mock.calls[0][0].requestBody.start.timeZone).toBe(
      'America/Sao_Paulo',
    );
  });
});
