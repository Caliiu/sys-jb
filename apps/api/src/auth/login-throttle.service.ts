import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';

/** Bloqueio temporário: MAX_FAILURES falhas por identificador dentro da janela. */
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;

/** Quem tenta entrar: clientes por CPF, operadores por e-mail (espaços de nome separados). */
export type LoginScope = 'user' | 'operator';

/**
 * Controle de tentativas de login compartilhado por clientes e operadores. Conta falhas também
 * de identificadores inexistentes (não revela cadastros) e guarda só um HMAC do identificador.
 */
@Injectable()
export class LoginThrottleService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  identifierHash(tenantId: string, scope: LoginScope, identifier: string): string {
    const subject = scope === 'user' ? `${tenantId}:${identifier}` : `${tenantId}:${scope}:${identifier}`;
    return createHmac('sha256', this.config.authSecret).update(subject).digest('hex');
  }

  windowStart(): Date {
    return new Date(Date.now() - FAILURE_WINDOW_MS);
  }

  recentFailures(tx: TenantTx, tenantId: string, identifierHash: string): Promise<Array<{ createdAt: Date }>> {
    return tx.loginFailure.findMany({
      where: { tenantId, identifierHash, createdAt: { gt: this.windowStart() } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Lança 429 (com Retry-After) se o limite de falhas da janela já foi atingido. */
  assertNotLocked(failures: Array<{ createdAt: Date }>): void {
    if (failures.length < MAX_FAILURES) return;
    // Liberado quando falhas suficientes saírem da janela.
    const releasing = failures[failures.length - MAX_FAILURES]!.createdAt.getTime() + FAILURE_WINDOW_MS;
    throw Errors.tooManyAttempts(Math.max(1, Math.ceil((releasing - Date.now()) / 1000)));
  }

  async recordFailure(tenantId: string, identifierHash: string): Promise<void> {
    const windowStart = this.windowStart();
    await this.db.withTenant(tenantId, async (tx) => {
      await tx.loginFailure.deleteMany({ where: { tenantId, createdAt: { lte: windowStart } } });
      await tx.loginFailure.create({ data: { tenantId, identifierHash } });
    });
  }

  clear(tx: TenantTx, tenantId: string, identifierHash: string): Promise<unknown> {
    return tx.loginFailure.deleteMany({ where: { tenantId, identifierHash } });
  }
}
