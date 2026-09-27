import { timingSafeEqual } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { Errors } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig, digestKey } from '../config/config.js';

/**
 * Credencial do painel administrativo único (admin.<domínio>), só do servidor web. Não escolhe banca:
 * a banca vem do operador que faz login (e da sessão dele depois). Diferente das credenciais das
 * bancas, que não abrem estas rotas, e vice-versa. Sem ADMIN_SERVICE_KEY configurada, o painel fica
 * desativado (nenhuma credencial é aceita).
 */
@Injectable()
export class ConsoleGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const expected = this.config.adminKeyDigest;
    const match = /^Bearer ([\x21-\x7e]{1,512})$/.exec(req.headers.authorization ?? '');
    if (!expected || !match?.[1]) throw Errors.unauthorized();
    if (!timingSafeEqual(digestKey(match[1]), expected)) throw Errors.unauthorized();
    return true;
  }
}
