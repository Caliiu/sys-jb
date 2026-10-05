import { timingSafeEqual } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig, digestKey } from '../config/config.js';

const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Token ausente ou inválido.');

/**
 * Token do webhook do cassino. O provedor só chama o endereço cadastrado (sem cabeçalho próprio), então o token vai no
 * endereço público (/integracoes/cassino?token=...) e o web o repassa no cabeçalho X-Casino-Token. Comparação dos
 * digests em tempo constante. Sem cassino ou sem CASINO_WEBHOOK_TOKEN, nada é aceito.
 */
@Injectable()
export class CasinoWebhookGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.casino?.webhookTokenDigest;
    if (!expected) throw unauthorized();
    const value = context.switchToHttp().getRequest<Request>().headers['x-casino-token'];
    if (typeof value !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(value)) throw unauthorized();
    if (!timingSafeEqual(digestKey(value), expected)) throw unauthorized();
    return true;
  }
}
