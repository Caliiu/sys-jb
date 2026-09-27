import { type CanActivate, createParamDecorator, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Errors } from '../common/app-error.js';
import { AuthService } from './auth.service.js';
import type { SessionRequest, UserSession } from './session.types.js';

/** Header com o token de sessão do cliente (a credencial de serviço continua em Authorization). */
export const SESSION_HEADER = 'x-session-token';

/**
 * Autentica o CLIENTE pela sessão. Deve rodar DEPOIS do TenantGuard (`@UseGuards(TenantGuard, SessionGuard)`):
 * a sessão só vale na banca do hostname. Sessão ausente, expirada, revogada ou de usuário bloqueado: 401.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SessionRequest>();
    if (!req.tenant) throw Errors.internal();

    const header = req.headers[SESSION_HEADER];
    req.userSession = await this.auth.authenticate(req.tenant, typeof header === 'string' ? header : undefined);
    return true;
  }
}

export const CurrentSession = createParamDecorator((_data: unknown, ctx: ExecutionContext): UserSession => {
  const session = ctx.switchToHttp().getRequest<SessionRequest>().userSession;
  if (!session) throw Errors.internal();
  return session;
});
