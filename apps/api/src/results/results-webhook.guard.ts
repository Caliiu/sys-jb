import { timingSafeEqual } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig, digestKey } from '../config/config.js';

const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Token ausente ou inválido.');

/**
 * Token do webhook de resultados. O provedor manda o mesmo token em até três cabeçalhos (X-Auth-Token, Token e
 * Authorization: Bearer); todos os que vierem precisam conferir, e pelo menos um precisa vir. Comparação dos digests
 * em tempo constante. Sem RESULTS_WEBHOOK_TOKEN configurado, nenhum token é aceito (webhook desativado).
 */
@Injectable()
export class ResultsWebhookGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.resultsWebhookTokenDigest;
    if (!expected) throw unauthorized();

    const req = context.switchToHttp().getRequest<Request>();
    const presented = presentedTokens(req);
    if (presented === null || presented.length === 0) throw unauthorized();

    let valid = true;
    for (const token of presented) {
      // Sem interromper no primeiro erro: o tempo não revela qual cabeçalho falhou.
      if (!timingSafeEqual(digestKey(token), expected)) valid = false;
    }
    if (!valid) throw unauthorized();
    return true;
  }
}

/** Tokens dos cabeçalhos presentes; null se algum veio malformado (repetido, com espaço, Authorization sem Bearer). */
function presentedTokens(req: Request): string[] | null {
  const tokens: string[] = [];
  for (const name of ['x-auth-token', 'token'] as const) {
    const value = req.headers[name];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(value.trim())) return null;
    tokens.push(value.trim());
  }
  const authorization = req.headers.authorization;
  if (authorization !== undefined) {
    const match = /^Bearer ([\x21-\x7e]{1,512})$/.exec(authorization.trim());
    if (!match?.[1]) return null;
    tokens.push(match[1]);
  }
  return tokens;
}
