import { applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

/**
 * Limites de requisições por minuto (§57).
 *
 * O ThrottlerModule registra um único limitador ("default") e cada rota
 * sensível sobrescreve o próprio limite com estes decorators. Os valores são
 * lidos do ambiente a cada requisição (o @nestjs/throttler aceita `limit`
 * como função), o que permite ajustar por deploy sem recompilar e afrouxar os
 * limites nos testes automatizados.
 */
export const RATE_LIMIT_WINDOW_MS = 60_000;

export type RateLimitName = 'default' | 'auth' | 'public' | 'booking';

const DEFAULTS: Record<RateLimitName, number> = {
  default: 120,
  auth: 10,
  public: 60,
  booking: 10,
};

export function rateLimitFor(name: RateLimitName): number {
  const fromEnv = process.env[`RATE_LIMIT_${name.toUpperCase()}`];
  const parsed = Number(fromEnv);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULTS[name];
}

function limiter(name: RateLimitName) {
  return applyDecorators(
    Throttle({ default: { limit: () => rateLimitFor(name), ttl: RATE_LIMIT_WINDOW_MS } }),
  );
}

/** Login/cadastro: protege contra força bruta e criação em massa de contas. */
export const AuthRateLimit = () => limiter('auth');

/** Leitura pública: evita varredura de horários por bots. */
export const PublicRateLimit = () => limiter('public');

/** Escrita pública (reservar, cancelar, reagendar). */
export const BookingRateLimit = () => limiter('booking');
