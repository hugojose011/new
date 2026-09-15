/**
 * Cliente HTTP da API.
 *
 * Regras:
 * - sempre `credentials: 'include'` (a sessão é um cookie HttpOnly);
 * - mutações repetem o cookie CSRF no header (double submit);
 * - erros viram ApiError com o `code` estável devolvido pelo backend, para a
 *   interface escolher a mensagem certa sem interpretar texto.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = /(?:^|;\s*)agenda_csrf=([^;]+)/.exec(document.cookie);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const { query, ...init } = options;

  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const method = (init.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = readCsrfCookie();
    if (csrf) headers.set('x-csrf-token', csrf);
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.code ?? 'INTERNAL_ERROR',
      payload?.message ?? 'Não foi possível concluir a operação. Tente novamente.',
      payload?.details,
    );
  }

  return payload as T;
}

/** Mensagens amigáveis por código de erro (§61). */
export function messageForError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Não foi possível concluir a operação. Tente novamente.';
  }
  switch (error.code) {
    case 'SLOT_UNAVAILABLE':
      return 'Este horário acabou de ser reservado. Escolha outro horário.';
    case 'GOOGLE_REAUTH_REQUIRED':
      return 'Sua conexão com o Google Agenda precisa ser renovada.';
    case 'GOOGLE_NOT_CONNECTED':
      return 'A agenda do Google ainda não está conectada.';
    case 'GOOGLE_UNAVAILABLE':
      return 'O Google Agenda está indisponível no momento. Tente novamente em instantes.';
    case 'RATE_LIMITED':
      return 'Muitas tentativas em pouco tempo. Aguarde um instante.';
    default:
      return error.message;
  }
}
