import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { ERROR_CODES } from '../errors';
import { requestContext } from '../logger.service';

/**
 * Traduz qualquer exceção em uma resposta JSON previsível.
 * O cliente nunca recebe stack trace; o log interno mantém o detalhe (§61).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = requestContext.getStore()?.requestId ?? null;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = 'INTERNAL_ERROR';
    let message = 'Não foi possível concluir a operação. Tente novamente.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
        code = defaultCodeForStatus(status);
      } else {
        const body = payload as Record<string, unknown>;
        code = (body.code as string) ?? defaultCodeForStatus(status);
        const rawMessage = body.message;
        if (Array.isArray(rawMessage)) {
          code = ERROR_CODES.VALIDATION_FAILED;
          message = 'Dados inválidos.';
          details = rawMessage;
        } else if (typeof rawMessage === 'string') {
          message = rawMessage;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 = unique violation; P2025 = registro não encontrado.
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'UNIQUE_VIOLATION';
        message = 'Já existe um registro com esses dados.';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'Recurso não encontrado.';
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (status !== HttpStatus.NOT_FOUND) {
      this.logger.warn(`${request.method} ${request.url} -> ${status} (${code})`);
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      ...(details ? { details } : {}),
      requestId,
    });
  }
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ERROR_CODES.VALIDATION_FAILED;
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHENTICATED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL_ERROR';
  }
}
