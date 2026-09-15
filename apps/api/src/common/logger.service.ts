import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'password',
  'passwordhash',
  'access_token',
  'refresh_token',
  'accesstoken',
  'refreshtoken',
  'token',
  'client_secret',
  'encryptionkey',
];

/** Remove segredos antes de qualquer log (§7, §59). */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEYS.includes(key.toLowerCase()) ? '[redacted]' : redact(entry),
      ]),
    );
  }
  return value;
}

/**
 * Logger estruturado em JSON com correlation id (§60).
 * Em desenvolvimento cai no logger colorido padrão do Nest.
 */
@Injectable({ scope: Scope.DEFAULT })
export class StructuredLogger extends ConsoleLogger {
  private readonly json = process.env.NODE_ENV === 'production';

  private write(level: string, message: unknown, context?: string, extra?: unknown) {
    if (!this.json) {
      super[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
        typeof message === 'string' ? message : JSON.stringify(redact(message)),
        context,
      );
      return;
    }
    process.stdout.write(
      `${JSON.stringify({
        level,
        time: new Date().toISOString(),
        requestId: requestContext.getStore()?.requestId ?? null,
        context: context ?? null,
        message: typeof message === 'string' ? message : redact(message),
        ...(extra ? { detail: redact(extra) } : {}),
      })}\n`,
    );
  }

  log(message: unknown, context?: string) {
    this.write('info', message, context);
  }

  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }

  error(message: unknown, stack?: string, context?: string) {
    this.write('error', message, context, stack ? { stack } : undefined);
  }

  debug(message: unknown, context?: string) {
    if (process.env.LOG_LEVEL === 'debug') this.write('debug', message, context);
  }
}
