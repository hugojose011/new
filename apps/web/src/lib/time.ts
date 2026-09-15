import { DateTime } from 'luxon';

/** Timezone do navegador, base para exibir horários ao visitante (§26). */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}

/** Rótulo humano: "Brasília — America/Sao_Paulo". */
export function timezoneLabel(timezone: string): string {
  const now = DateTime.now().setZone(timezone);
  const city = timezone.split('/').pop()?.replace(/_/g, ' ') ?? timezone;
  return `${city} (${now.toFormat('ZZ')}) — ${timezone}`;
}

/** Lista curta de fusos comuns + o do visitante, para o seletor. */
export function commonTimezones(current: string): string[] {
  const list = [
    'America/Sao_Paulo',
    'America/Manaus',
    'America/Maceio',
    'America/Recife',
    'America/Fortaleza',
    'America/Bahia',
    'America/Belem',
    'America/Cuiaba',
    'America/Rio_Branco',
    'America/Noronha',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'America/Mexico_City',
    'America/Bogota',
    'America/Buenos_Aires',
    'Europe/Lisbon',
    'Europe/London',
    'Europe/Madrid',
    'Europe/Paris',
    'Europe/Berlin',
    'Africa/Luanda',
    'Asia/Dubai',
    'Asia/Tokyo',
    'Australia/Sydney',
    'UTC',
  ];
  return [...new Set([current, ...list])];
}

export function formatTime(iso: string, timezone: string): string {
  return DateTime.fromISO(iso).setZone(timezone).toFormat('HH:mm');
}

export function formatDateLong(iso: string, timezone: string, locale = 'pt-BR'): string {
  return DateTime.fromISO(iso)
    .setZone(timezone)
    .setLocale(locale)
    .toFormat("cccc, dd 'de' LLLL 'de' yyyy");
}

export function formatDateTimeLong(iso: string, timezone: string, locale = 'pt-BR'): string {
  return DateTime.fromISO(iso)
    .setZone(timezone)
    .setLocale(locale)
    .toFormat("cccc, dd 'de' LLLL 'de' yyyy 'às' HH:mm");
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
