import { createHmac } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DatabaseService } from '../database/database.service.js';
import type { RateLimitRule } from './rate-limit.rules.js';

/** Sujeito do limite: IP (só o HMAC), jogador (id) ou operador (id). */
export type RateLimitSubject =
  { kind: 'ip'; ip: string } | { kind: 'user'; id: string } | { kind: 'operator'; id: string };

/** Com que frequência (no máximo) cada instância apaga contadores vencidos. */
const CLEANUP_EVERY_MS = 60_000;

const tooManyRequests = (retryAfterSeconds: number) =>
  new AppError(429, 'TOO_MANY_ATTEMPTS', 'Muitas requisições. Aguarde um pouco e tente novamente.', undefined, {
    'Retry-After': String(retryAfterSeconds),
  });

/**
 * Contadores por janela fixa no PostgreSQL (valem para todas as instâncias da API). Cada requisição conta em todas
 * as regras que se aplicam a ela numa única ida ao banco; estourar qualquer janela responde 429 com Retry-After.
 * Toda tentativa conta (inclusive as recusadas), então insistir não abre a janela antes da hora.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger('RateLimit');
  private lastCleanup = 0;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get enabled(): boolean {
    return this.config.rateLimit.enabled;
  }

  /** Conta a requisição em cada par (regra, sujeito) e lança 429 se alguma janela passou do limite. */
  async hit(entries: Array<{ rule: RateLimitRule; subject: RateLimitSubject }>): Promise<void> {
    if (!this.enabled || entries.length === 0) return;
    const keys: string[] = [];
    const windows: number[] = [];
    const limits = new Map<string, number>();
    for (const { rule, subject } of entries) {
      const subjectKey = this.subjectKey(subject);
      for (const window of this.config.rateLimit.rules[rule]) {
        const key = `${rule}:${subjectKey}:${window.windowSeconds}`;
        keys.push(key);
        windows.push(window.windowSeconds);
        limits.set(key, window.limit);
      }
    }

    // Janela fixa alinhada ao relógio do banco (igual em todas as instâncias).
    const rows = await this.db.client.$queryRaw<Array<{ key: string; hits: number; expires_at: Date }>>`
      INSERT INTO "rate_limit_counters" ("key", "window_start", "hits", "expires_at")
      SELECT k, to_timestamp(floor(extract(epoch FROM now()) / w) * w), 1,
             to_timestamp((floor(extract(epoch FROM now()) / w) + 1) * w)
      FROM unnest(${keys}::text[], ${windows}::int[]) AS t(k, w)
      ON CONFLICT ("key", "window_start") DO UPDATE SET "hits" = "rate_limit_counters"."hits" + 1
      RETURNING "key", "hits", "expires_at"`;
    this.cleanupSoon();

    let retryAfter = 0;
    for (const row of rows) {
      if (row.hits > (limits.get(row.key) ?? Number.POSITIVE_INFINITY)) {
        retryAfter = Math.max(retryAfter, Math.ceil((row.expires_at.getTime() - Date.now()) / 1000));
      }
    }
    if (retryAfter > 0) throw tooManyRequests(retryAfter);
  }

  /** IP só como HMAC (dado pessoal); ids de jogador e operador já são opacos (UUID). */
  private subjectKey(subject: RateLimitSubject): string {
    switch (subject.kind) {
      case 'ip':
        return `i:${createHmac('sha256', this.config.authSecret).update(`ip:${subject.ip}`).digest('base64url')}`;
      case 'user':
        return `u:${subject.id}`;
      case 'operator':
        return `o:${subject.id}`;
    }
  }

  /** Apaga contadores vencidos, no máximo uma vez por minuto por instância, sem atrasar a requisição. */
  private cleanupSoon(): void {
    const now = Date.now();
    if (now - this.lastCleanup < CLEANUP_EVERY_MS) return;
    this.lastCleanup = now;
    this.db.client.$executeRaw`DELETE FROM "rate_limit_counters" WHERE "expires_at" < now()`.catch((error: unknown) =>
      this.logger.warn(`limpeza dos contadores falhou: ${error instanceof Error ? error.name : 'erro'}`),
    );
  }
}
