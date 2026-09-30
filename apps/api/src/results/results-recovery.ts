import type { PrismaClient } from '@sysjb/database';
import { type ConsultaClientOptions, ConsultaError, fetchResults } from './consulta-client.js';
import { lastAnsweredAt, monthUsage, recordConsultation, storedExtractions } from './consulta-log.js';
import { planConsulta, type SkipReason } from './consulta-planner.js';
import { type NormalizedResult, normalizeConsultaItem } from './result-normalizer.js';
import type { ResultsConsultaConfig } from './results.config.js';
import { type StoreOutcome, storeResult } from './results.store.js';

type Db = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;

export interface RecoveryRequest {
  /** YYYY-MM-DD (Brasília), hoje ou passado. */
  date: string;
  lotteries: readonly string[];
  /** Só com uma sigla. */
  extraction?: number;
  force?: boolean;
}

export type RecoveryEvent =
  | { type: 'skipped'; lottery: string; reason: SkipReason; retryAt?: Date }
  | { type: 'empty'; lottery: string }
  | { type: 'stored'; result: NormalizedResult; outcome: StoreOutcome }
  | { type: 'rejected'; lottery: string; message: string }
  | { type: 'failed'; lottery: string; message: string }
  | { type: 'quota'; used: number; limit: number };

export interface RecoverySummary {
  consulted: number;
  skipped: number;
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
  failed: number;
  /** Respostas do provedor no mês, depois desta execução. */
  used: number;
  /** Onde as consultas param (cota × %); null = cota não informada. */
  limit: number | null;
  /** Parou antes do fim: limite da cota ou token recusado. */
  stopped: 'quota' | 'unauthorized' | null;
}

export interface RecoveryOptions {
  onEvent?: (event: RecoveryEvent) => void;
  /** Injetável nos testes. */
  client?: Pick<ConsultaClientOptions, 'fetchImpl' | 'sleep' | 'timeoutMs'>;
  now?: () => Date;
}

/** Novas tentativas do cliente (cada uma conta na cota), nunca além do que resta até o limite. */
const MAX_RETRIES = 2;

/**
 * Recupera resultados pela API de consulta gastando o mínimo da cota:
 * 1. não consulta o que já está gravado nem extração que ainda não saiu (planConsulta);
 * 2. não repete consulta respondida há menos de `cooldownMinutes`;
 * 3. registra cada consulta (result_consultations) e para ao chegar em `quotaStopPercent` da cota mensal;
 * 4. token recusado (401: inválido ou cota do provedor esgotada) interrompe tudo.
 * Duas execuções simultâneas podem passar juntas pela conferência da cota; o excesso é de no máximo uma consulta cada.
 */
export async function recoverResults(
  db: Db,
  config: ResultsConsultaConfig,
  request: RecoveryRequest,
  options: RecoveryOptions = {},
): Promise<RecoverySummary> {
  const emit = options.onEvent ?? (() => {});
  const now = options.now ?? (() => new Date());
  const limit = config.monthlyQuota === null ? null : Math.floor((config.monthlyQuota * config.quotaStopPercent) / 100);
  const summary: RecoverySummary = {
    consulted: 0,
    skipped: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    rejected: 0,
    failed: 0,
    used: await monthUsage(db),
    limit,
    stopped: null,
  };

  for (const lottery of request.lotteries) {
    const nowIso = now().toISOString();
    const plan = planConsulta({
      date: request.date,
      lottery,
      extraction: request.extraction,
      nowIso,
      stored: await storedExtractions(db, request.date, lottery),
      lastAnsweredAt: await lastAnsweredAt(db, request.date, lottery),
      cooldownMinutes: config.cooldownMinutes,
      force: request.force ?? false,
    });
    if (!plan.consult) {
      summary.skipped += 1;
      emit({ type: 'skipped', lottery, reason: plan.reason, retryAt: plan.retryAt });
      continue;
    }

    if (limit !== null && summary.used >= limit) {
      summary.stopped = 'quota';
      emit({ type: 'quota', used: summary.used, limit });
      break;
    }

    let responses = 0;
    let lastStatus: number | null = null;
    let items: unknown[] = [];
    let error: ConsultaError | null = null;
    try {
      items = await fetchResults(
        config,
        { date: request.date, lottery, extraction: plan.extraction },
        {
          ...options.client,
          retries: limit === null ? MAX_RETRIES : Math.max(0, Math.min(MAX_RETRIES, limit - summary.used - 1)),
          onResponse: (status) => {
            responses += 1;
            lastStatus = status;
          },
        },
      );
    } catch (caught) {
      error = caught instanceof ConsultaError ? caught : new ConsultaError('falha inesperada na consulta', false);
    }

    summary.consulted += 1;
    summary.used += responses;
    await recordConsultation(db, {
      date: request.date,
      lottery,
      extraction: plan.extraction,
      status: error ? 'ERROR' : items.length === 0 ? 'EMPTY' : 'OK',
      // Formato inesperado com resposta 200 ainda é um erro, mas a resposta contou.
      httpStatus: lastStatus,
      responses,
      items: items.length,
    });

    if (error) {
      summary.failed += 1;
      emit({ type: 'failed', lottery, message: error.message });
      if (error.status === 401) {
        summary.stopped = 'unauthorized';
        break;
      }
      continue;
    }
    if (items.length === 0) emit({ type: 'empty', lottery });

    for (const item of items) {
      const normalized = normalizeConsultaItem(item, nowIso);
      if (!normalized.ok) {
        summary.rejected += 1;
        emit({
          type: 'rejected',
          lottery,
          message: normalized.issues.map((i) => `${i.field}: ${i.message}`).join('; '),
        });
        continue;
      }
      const result = normalized.result;
      // Só grava o que foi pedido: item de outra data/sigla/extração indica resposta trocada.
      if (
        result.date !== request.date ||
        result.lottery !== lottery ||
        (plan.extraction !== undefined && result.extraction !== plan.extraction)
      ) {
        summary.rejected += 1;
        emit({ type: 'rejected', lottery, message: 'item não corresponde à consulta' });
        continue;
      }
      const outcome = await storeResult(db, result, 'CONSULTA');
      summary[outcome.status] += 1;
      emit({ type: 'stored', result, outcome });
    }
  }
  return summary;
}
