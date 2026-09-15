import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { CSRF_COOKIE, CSRF_HEADER } from './auth.constants';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double submit cookie.
 *
 * O cookie de sessão é HttpOnly + SameSite=Lax, o que já barra a maior parte
 * dos ataques CSRF. Como camada adicional, mutações autenticadas precisam
 * repetir no header o valor de um cookie legível (não-HttpOnly): um site
 * terceiro consegue disparar a requisição, mas não consegue ler o cookie
 * para preencher o header.
 *
 * Rotas públicas (agendamento por link) não exigem CSRF: não há sessão nem
 * ação privilegiada associada ao cookie.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const cookieToken = request.cookies?.[CSRF_COOKIE];
    const headerToken = request.headers[CSRF_HEADER];

    if (
      typeof cookieToken !== 'string' ||
      typeof headerToken !== 'string' ||
      cookieToken.length === 0 ||
      cookieToken.length !== headerToken.length ||
      !timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
    ) {
      throw new ForbiddenException('Token CSRF ausente ou inválido.');
    }
    return true;
  }
}
