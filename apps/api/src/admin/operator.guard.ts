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

/** Header com o token de sessão do operador (a credencial do painel continua em Authorization). */
export const OPERATOR_HEADER = 'x-operator-token';

const PERMISSION_KEY = 'requiredPermission';

/** Exige que o perfil do operador tenha a permissão. Sem o decorator, basta estar autenticado. */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);

/**
 * Autentica o operador pela sessão, define a banca da requisição (`req.tenant`) a partir dele e confere
 * a permissão da rota. Deve rodar DEPOIS do ConsoleGuard (`@UseGuards(ConsoleGuard, OperatorGuard)`).
 * A banca nunca vem do endereço, de body, query ou header: só da sessão do operador.
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

    const header = req.headers[OPERATOR_HEADER];
    const { operator, tenant } = await this.auth.authenticate(typeof header === 'string' ? header : undefined);

    const required = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !hasPermission(operator.role, required)) throw Errors.permissionDenied();

    req.operator = operator;
    req.tenant = tenant;
    return true;
  }
}

export const CurrentOperator = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedOperator => {
  const operator = ctx.switchToHttp().getRequest<OperatorRequest>().operator;
  if (!operator) throw Errors.internal();
  return operator;
});
