import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission } from '@sysjb/contracts';
import { Errors } from '../common/app-error.js';
import { OperatorAuthService } from './operator-auth.service.js';
import type { AuthenticatedOperator, OperatorRequest } from './operator.types.js';

/** Header com o token de sessão do operador (a credencial de serviço continua em Authorization). */
export const OPERATOR_HEADER = 'x-operator-token';

const PERMISSION_KEY = 'requiredPermission';

/** Exige que o perfil do operador tenha a permissão. Sem o decorator, basta estar autenticado. */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);

/**
 * Autentica o operador pela sessão e confere a permissão da rota. Deve rodar DEPOIS do TenantGuard
 * (`@UseGuards(TenantGuard, OperatorGuard)`): a sessão só vale na banca do hostname.
 * 401 (sessão) -> 403 (perfil sem a permissão).
 */
@Injectable()
export class OperatorGuard implements CanActivate {
  constructor(
    @Inject(OperatorAuthService) private readonly auth: OperatorAuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<OperatorRequest>();
    if (!req.tenant) throw Errors.internal();

    const header = req.headers[OPERATOR_HEADER];
    const operator = await this.auth.authenticate(req.tenant, typeof header === 'string' ? header : undefined);

    const required = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !hasPermission(operator.role, required)) throw Errors.permissionDenied();

    req.operator = operator;
    return true;
  }
}

export const CurrentOperator = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedOperator => {
  const operator = ctx.switchToHttp().getRequest<OperatorRequest>().operator;
  if (!operator) throw Errors.internal();
  return operator;
});
