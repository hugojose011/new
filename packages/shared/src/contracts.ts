import type {
  BookingStatus,
  CalendarConnectionStatus,
  EventKind,
  LocationType,
  OverrideType,
  QuestionType,
} from './enums';

/** Slot retornado pela API pública de disponibilidade. Sempre ISO-8601 com offset. */
export interface SlotDto {
  start: string;
  end: string;
}

export interface DayAvailabilityDto {
  date: string; // YYYY-MM-DD no timezone solicitado
  timezone: string;
  slots: SlotDto[];
}

export interface AvailabilityResponseDto {
  timezone: string;
  durationMinutes: number;
  days: DayAvailabilityDto[];
}

export interface PublicEventTypeDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  locationType: LocationType;
  locationValue: string | null;
  timezone: string;
  kind: EventKind;
  host: { name: string; username: string; timezone: string };
  questions: PublicQuestionDto[];
}

export interface PublicQuestionDto {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options: string[];
  order: number;
}

export interface BookingConfirmationDto {
  id: string;
  status: BookingStatus;
  startAt: string;
  endAt: string;
  timezone: string;
  eventName: string;
  hostName: string;
  inviteeName: string;
  inviteeEmail: string;
  locationType: LocationType;
  locationValue: string | null;
  meetUrl: string | null;
  cancelUrl: string | null;
  rescheduleUrl: string | null;
}

export interface CalendarConnectionDto {
  connected: boolean;
  status: CalendarConnectionStatus | null;
  accountEmail: string | null;
  lastSyncedAt: string | null;
  calendars: ConnectedCalendarDto[];
}

export interface ConnectedCalendarDto {
  id: string;
  providerCalendarId: string;
  name: string;
  isPrimary: boolean;
  checkConflicts: boolean;
  isBookingDestination: boolean;
  accessRole: string | null;
  timezone: string | null;
}

export interface AvailabilityRuleDto {
  weekday: number; // 0 = domingo ... 6 = sábado
  startMinute: number;
  endMinute: number;
}

export interface AvailabilityOverrideDto {
  id?: string;
  date: string; // YYYY-MM-DD
  type: OverrideType;
  intervals: { startMinute: number; endMinute: number }[];
}

export interface AvailabilityScheduleDto {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  rules: AvailabilityRuleDto[];
  overrides: AvailabilityOverrideDto[];
}
