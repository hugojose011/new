import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { SESSION_COOKIE, SessionPayload } from './auth.constants';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

/**
 * Autenticação por cookie HttpOnly assinado (JWT).
 *
 * O token nunca é acessível ao JavaScript do navegador, o que elimina a
 * classe mais comum de roubo de sessão. A proteção CSRF fica a cargo do
 * CsrfGuard, já que o cookie é enviado automaticamente pelo browser.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = request.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('Sessão não encontrada.');

    try {
      const payload = await this.jwt.verifyAsync<SessionPayload>(token);
      request.user = {
        ...payload,
        id: payload.sub,
        workspaceId: payload.wid,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Sessão expirada ou inválida.');
    }
  }
}
