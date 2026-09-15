import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';

/**
 * Códigos de erro estáveis consumidos pelo frontend. O texto exibido ao
 * usuário é responsabilidade da interface (§61, §65) — a API entrega um
 * código e uma mensagem neutra, nunca stack traces.
 */
export const ERROR_CODES = {
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  GOOGLE_REAUTH_REQUIRED: 'GOOGLE_REAUTH_REQUIRED',
  GOOGLE_UNAVAILABLE: 'GOOGLE_UNAVAILABLE',
  GOOGLE_NOT_CONNECTED: 'GOOGLE_NOT_CONNECTED',
  BOOKING_ALREADY_CANCELLED: 'BOOKING_ALREADY_CANCELLED',
  BOOKING_TOO_LATE: 'BOOKING_TOO_LATE',
  INVALID_TOKEN: 'INVALID_TOKEN',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class AppException extends HttpException {
  constructor(code: ErrorCode, message: string, status: HttpStatus) {
    super({ code, message, statusCode: status }, status);
  }
}

/** 409 — o horário deixou de estar disponível entre a consulta e a reserva. */
export class SlotUnavailableException extends ConflictException {
  constructor(message = 'Este horário não está mais disponível.') {
    super({ code: ERROR_CODES.SLOT_UNAVAILABLE, message, statusCode: HttpStatus.CONFLICT });
  }
}

/** 422 — regra de negócio (ex.: cancelar em cima da hora). */
export class BusinessRuleException extends AppException {
  constructor(code: ErrorCode, message: string) {
    super(code, message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** 503 — a integração obrigatória com o Google está indisponível. */
export class IntegrationUnavailableException extends AppException {
  constructor(code: ErrorCode, message: string) {
    super(code, message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
