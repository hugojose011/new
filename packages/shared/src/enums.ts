/** Enumerações compartilhadas entre API e Web. Espelham o schema Prisma. */

export const BOOKING_STATUS = [
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'RESCHEDULED',
  'FAILED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUS)[number];

/** Estados que efetivamente ocupam a agenda do host. */
export const BLOCKING_BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED'];

export const LOCATION_TYPE = ['GOOGLE_MEET', 'PHYSICAL', 'CUSTOM_LINK', 'PHONE', 'NONE'] as const;
export type LocationType = (typeof LOCATION_TYPE)[number];

export const EVENT_KIND = ['ONE_TO_ONE', 'GROUP', 'COLLECTIVE', 'ROUND_ROBIN'] as const;
export type EventKind = (typeof EVENT_KIND)[number];

export const QUESTION_TYPE = ['TEXT', 'TEXTAREA', 'SELECT', 'RADIO', 'CHECKBOX'] as const;
export type QuestionType = (typeof QUESTION_TYPE)[number];

export const CALENDAR_CONNECTION_STATUS = ['CONNECTED', 'DISCONNECTED', 'REAUTH_REQUIRED'] as const;
export type CalendarConnectionStatus = (typeof CALENDAR_CONNECTION_STATUS)[number];

export const OVERRIDE_TYPE = ['UNAVAILABLE', 'CUSTOM_HOURS'] as const;
export type OverrideType = (typeof OVERRIDE_TYPE)[number];

export const WORKSPACE_ROLE = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLE)[number];

export const BOOKING_HISTORY_ACTION = [
  'CREATED',
  'CONFIRMED',
  'RESCHEDULED',
  'CANCELLED',
  'FAILED',
] as const;
export type BookingHistoryAction = (typeof BOOKING_HISTORY_ACTION)[number];
