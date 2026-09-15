export const SESSION_COOKIE = 'agenda_session';
export const CSRF_COOKIE = 'agenda_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export interface SessionPayload {
  sub: string; // userId
  wid: string; // workspaceId
  email: string;
}
