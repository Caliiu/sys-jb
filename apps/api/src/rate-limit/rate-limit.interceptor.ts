import { isIP } from 'node:net';
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { from, type Observable, switchMap } from 'rxjs';
import type { OperatorRequest } from '../admin/operator.types.js';
import type { SessionRequest } from '../auth/session.types.js';
import type { RateLimitRule } from './rate-limit.rules.js';
import { RateLimitService, type RateLimitSubject } from './rate-limit.service.js';

/** IP do visitante, repassado pelo servidor do web (a API só é chamada por ele, com a credencial de serviço). */
export const CLIENT_IP_HEADER = 'x-client-ip';

const ROUTE_RULE_KEY = 'rateLimitRouteRule';

/** Regra por IP própria da rota, além das gerais (ex.: login e cadastro). */
export const RateLimitIp = (rule: Extract<RateLimitRule, 'login_ip' | 'signup_ip'>) =>
  SetMetadata(ROUTE_RULE_KEY, rule);

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Limite de requisições em todas as rotas /v1 (roda depois dos guards, então a credencial de serviço já foi
 * conferida e a sessão já é conhecida):
 * - por IP (quando o web informa): todas as requisições (`requests_ip`) e, em login/cadastro, a regra da rota;
 * - por jogador logado (`user_write` / `user_read`) e por operador (`operator_write` / `operator_read`).
 * Sem o IP (integração direta com a credencial de serviço), só os limites por sessão valem.
 */
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(
    @Inject(RateLimitService) private readonly limits: RateLimitService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.limits.enabled || context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & SessionRequest & OperatorRequest>();
    if (!req.path.startsWith('/v1/')) return next.handle();

    const entries: Array<{ rule: RateLimitRule; subject: RateLimitSubject }> = [];
    const ip = clientIp(req);
    if (ip) {
      const subject: RateLimitSubject = { kind: 'ip', ip };
      entries.push({ rule: 'requests_ip', subject });
      const routeRule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(ROUTE_RULE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (routeRule) entries.push({ rule: routeRule, subject });
    }
    const write = !READ_METHODS.has(req.method);
    if (req.userSession) {
      entries.push({ rule: write ? 'user_write' : 'user_read', subject: { kind: 'user', id: req.userSession.userId } });
    } else if (req.operator) {
      entries.push({
        rule: write ? 'operator_write' : 'operator_read',
        subject: { kind: 'operator', id: req.operator.id },
      });
    }

    return from(this.limits.hit(entries)).pipe(switchMap(() => next.handle()));
  }
}

/** Só um IP válido (v4 ou v6); qualquer outra coisa no cabeçalho é ignorada. */
function clientIp(req: Request): string | null {
  const raw = req.headers[CLIENT_IP_HEADER];
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value.length <= 45 && isIP(value) !== 0 ? value.toLowerCase() : null;
}
