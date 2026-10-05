'use server';

import { isReportDate, type LotteryResultsResponse, RESULTS_DAYS_BACK } from '@sysjb/contracts';
import { resolveRequest } from '@/lib/request-context';
import { loadResults } from '@/lib/results';

export type ResultsLoadResult =
  | { ok: true; report: LotteryResultsResponse; /** ISO 8601 da consulta (hora do comprovante). */ consultedAt: string }
  | { ok: false; code: 'SESSION_INVALID' | 'INVALID_DATE' | 'UNAVAILABLE'; message: string };

/**
 * Resultados de um dia para a tela Resultados > Resultado loterias (rota única: a data escolhida não vai para a URL).
 * Server action = endpoint público: exige sessão e confere a data (hoje e os dias anteriores aceitos pela consulta).
 */
export async function loadResultsAction(date: unknown): Promise<ResultsLoadResult> {
  const ctx = await resolveRequest();
  if (!ctx.ok || !ctx.me) return { ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada. Entre novamente.' };

  const nowIso = new Date().toISOString();
  if (typeof date !== 'string' || !isReportDate(nowIso, date, RESULTS_DAYS_BACK)) {
    return { ok: false, code: 'INVALID_DATE', message: 'Data fora do período de consulta.' };
  }
  const report = await loadResults(ctx.hostname, date);
  if (!report) {
    return { ok: false, code: 'UNAVAILABLE', message: 'Não foi possível consultar os resultados. Tente novamente.' };
  }
  return { ok: true, report, consultedAt: nowIso };
}
