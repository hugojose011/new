/** Utilidades de tempo puras, sem dependência de framework. */

export const MINUTES_IN_DAY = 24 * 60;

/** "09:30" -> 570 */
export function timeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Horário inválido: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) {
    throw new Error(`Horário fora dos limites: ${value}`);
  }
  return hours * 60 + minutes;
}

/** 570 -> "09:30" */
export function minutesToTime(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > MINUTES_IN_DAY) {
    throw new Error(`Minuto inválido: ${value}`);
  }
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export const WEEKDAY_LABELS_PT_BR = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

/** Normaliza texto livre para um slug de URL. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Formato de um identificador IANA: "UTC", "America/Sao_Paulo",
 * "Etc/GMT+3". Deliberadamente não casa com offsets fixos como "-03:00",
 * que o `Intl` aceita mas que ignoram horário de verão (§26, §78).
 */
const IANA_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

/**
 * Valida um timezone IANA. Requer um `Intl.DateTimeFormat` funcional, que
 * existe tanto no Node quanto nos navegadores suportados.
 */
export function isIanaTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !IANA_NAME_PATTERN.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
