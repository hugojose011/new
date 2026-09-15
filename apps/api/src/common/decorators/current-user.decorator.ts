import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionPayload } from '../../auth/auth.constants';

export interface AuthenticatedUser extends SessionPayload {
  id: string;
  workspaceId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!request.user) throw new Error('CurrentUser usado em rota sem AuthGuard.');
    return request.user;
  },
);
