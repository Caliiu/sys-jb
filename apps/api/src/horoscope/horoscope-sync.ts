import { drawDateOf } from '@sysjb/contracts';
import type { PrismaClient } from '@sysjb/database';
import { type HoroscopeClientOptions, HoroscopeApiError, fetchHoroscope } from './horoscope-client.js';
import type { HoroscopeBatch } from './horoscope-normalizer.js';
import { normalizeHoroscope } from './horoscope-normalizer.js';
import type { HoroscopeConfig } from './horoscope.config.js';

type Db = Pick<PrismaClient, '$transaction' | '$executeRaw' | '$queryRaw'>;

/**
 * Grava as previsões (uma instrução por signo, numa transação). Igual ao gravado não altera nada; diferente (correção
 * do provedor no mesmo dia) substitui. Devolve quantas linhas mudaram.
 */
export async function storeHoroscope(db: Db, batch: HoroscopeBatch): Promise<number> {
  const counts = await db.$transaction(
    batch.readings.map(
      (r) => db.$executeRaw`
        INSERT INTO "horoscope_readings" AS t ("reference_date", "sign", "text", "tens", "colors")
        VALUES (${batch.date}::date, ${r.sign}, ${r.text}, ${r.tens}::text[], ${r.colors}::text[])
        ON CONFLICT ("reference_date", "sign") DO UPDATE SET
          "text" = EXCLUDED."text", "tens" = EXCLUDED."tens", "colors" = EXCLUDED."colors", "fetched_at" = now()
        WHERE (t."text", t."tens", t."colors") IS DISTINCT FROM (EXCLUDED."text", EXCLUDED."tens", EXCLUDED."colors")`,
    ),
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

/** Quantos signos da data já estão no cache. */
export async function cachedSigns(db: Db, date: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM "horoscope_readings" WHERE "reference_date" = ${date}::date`;
  return rows[0]?.n ?? 0;
}

export type HoroscopeSyncOutcome =
  | { status: 'stored'; date: string; signs: number; changed: number; rejected: HoroscopeBatch['rejected'] }
  /** O provedor ainda não publicou o dia (ou devolveu outro dia): tentar de novo mais tarde. */
  | { status: 'not_ready'; message: string }
  | { status: 'failed'; message: string; retry: boolean };

/** Uma busca: provedor → validação → cache. Não lança: o resultado diz o que aconteceu (e se vale tentar de novo). */
export async function syncHoroscope(
  db: Db,
  config: HoroscopeConfig,
  options: { now?: () => Date; client?: HoroscopeClientOptions } = {},
): Promise<HoroscopeSyncOutcome> {
  const nowIso = (options.now ?? (() => new Date()))().toISOString();
  let body: unknown;
  try {
    body = await fetchHoroscope(config, options.client);
  } catch (error) {
    const e = error instanceof HoroscopeApiError ? error : new HoroscopeApiError('falha inesperada', 'retryable');
    if (e.kind === 'not_ready') return { status: 'not_ready', message: e.message };
    return { status: 'failed', message: e.message, retry: e.kind === 'retryable' };
  }

  const normalized = normalizeHoroscope(body, nowIso);
  if (!normalized.ok) return { status: 'failed', message: normalized.reason, retry: false };
  const { batch } = normalized;
  const changed = await storeHoroscope(db, batch);
  // Previsão de outro dia (ex.: a de ontem, logo depois da meia-noite): grava, mas hoje continua pendente.
  if (batch.date !== drawDateOf(nowIso, 0)) {
    return { status: 'not_ready', message: `o provedor ainda devolve a previsão de ${batch.date}` };
  }
  return { status: 'stored', date: batch.date, signs: batch.readings.length, changed, rejected: batch.rejected };
}

// ---------------------------------------------------------------------------
// Horários (Brasília: UTC-3 fixo, como o resto do sistema)
// ---------------------------------------------------------------------------

const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Próxima execução diária (ms desde a época) depois de `nowMs`, no horário `syncMinutes` de Brasília. */
export function nextDailyRun(nowMs: number, syncMinutes: number): number {
  const local = nowMs - BRASILIA_OFFSET_MS;
  let run = Math.floor(local / DAY_MS) * DAY_MS + syncMinutes * 60_000;
  if (run <= local) run += DAY_MS;
  return run + BRASILIA_OFFSET_MS;
}

export interface SchedulerClock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const realClock: SchedulerClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    // O agendamento não segura o processo (encerramento e testes).
    handle.unref?.();
    return handle;
  },
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Agenda da busca diária: ao iniciar, busca se hoje ainda não está no cache; todo dia no horário configurado busca
 * de novo; "ainda não publicou" e falhas passageiras tentam de novo a cada `retryMinutes` (sem passar da próxima busca
 * diária). Uma busca por vez. Falha definitiva (token, limite diário) espera a próxima busca diária.
 */
export class HoroscopeScheduler {
  private daily: unknown = null;
  private retry: unknown = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly run: () => Promise<HoroscopeSyncOutcome>,
    private readonly isTodayCached: () => Promise<boolean>,
    private readonly config: Pick<HoroscopeConfig, 'syncMinutes' | 'retryMinutes'>,
    private readonly log: (level: 'log' | 'warn' | 'error', message: string) => void,
    private readonly clock: SchedulerClock = realClock,
  ) {}

  async start(): Promise<void> {
    this.scheduleDaily();
    let cached = false;
    try {
      cached = await this.isTodayCached();
    } catch {
      this.log('warn', 'não foi possível conferir o cache do horóscopo; buscando agora');
    }
    const at = `${String(Math.floor(this.config.syncMinutes / 60)).padStart(2, '0')}:${String(this.config.syncMinutes % 60).padStart(2, '0')}`;
    this.log(
      'log',
      `busca diária às ${at} (Brasília); hoje ${cached ? 'já está no cache' : 'ainda não está no cache: buscando agora'}`,
    );
    if (!cached) await this.execute();
  }

  stop(): void {
    this.stopped = true;
    this.clock.clearTimeout(this.daily);
    this.clock.clearTimeout(this.retry);
  }

  private scheduleDaily(): void {
    if (this.stopped) return;
    const delay = nextDailyRun(this.clock.now(), this.config.syncMinutes) - this.clock.now();
    this.daily = this.clock.setTimeout(() => {
      this.scheduleDaily();
      void this.execute();
    }, delay);
  }

  /** Nova tentativa só se cair antes da próxima busca diária (que já vai buscar de qualquer jeito). */
  private scheduleRetry(): void {
    const now = this.clock.now();
    const delay = this.config.retryMinutes * 60_000;
    if (this.stopped || now + delay >= nextDailyRun(now, this.config.syncMinutes)) return;
    this.clock.clearTimeout(this.retry);
    this.retry = this.clock.setTimeout(() => void this.execute(), delay);
  }

  /** Uma busca; se já houver outra em andamento, não faz nada. */
  async execute(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    this.clock.clearTimeout(this.retry);
    try {
      const outcome = await this.run();
      if (outcome.status === 'stored') {
        const rejected = outcome.rejected.length ? `, ${outcome.rejected.length} descartado(s)` : '';
        this.log(
          'log',
          `horóscopo de ${outcome.date}: ${outcome.signs} signos (${outcome.changed} atualizado(s)${rejected})`,
        );
      } else if (outcome.status === 'not_ready') {
        this.log(
          'warn',
          `horóscopo ainda não disponível (${outcome.message}); nova tentativa em ${this.config.retryMinutes} min`,
        );
        this.scheduleRetry();
      } else {
        this.log(outcome.retry ? 'warn' : 'error', `horóscopo: ${outcome.message}`);
        if (outcome.retry) this.scheduleRetry();
      }
    } catch {
      // Banco fora do ar ao gravar, por exemplo: tenta de novo.
      this.log('error', 'horóscopo: falha inesperada na sincronização');
      this.scheduleRetry();
    } finally {
      this.running = false;
    }
  }
}
