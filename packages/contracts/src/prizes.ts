/**
 * Premiadas > Consultar premiadas: pules premiadas do jogador num dia. A apuração de resultados ainda não
 * existe; até lá a API responde a lista vazia, e as telas já seguem este contrato.
 */

import { isReportDate, reportDates } from './reports.js';

/** Dias para trás (além de hoje) que a consulta aceita: a tela lista hoje e os 7 anteriores. */
export const PRIZES_MAX_DAYS_BACK = 7;

/** Aposta premiada dentro do pule. */
export interface PrizeTicketItem {
  /** Modalidade e colocação como no comprovante (ex.: "FZG1 1/1"). */
  label: string;
  amountCents: number;
  prizeCents: number;
  /** Palpites premiados (ex.: ["05"]). */
  guesses: string[];
}

export interface PrizeTicket {
  puleNumber: number;
  /** Nome da extração (ex.: LT PT RIO 09HS). */
  lottery: string;
  hour: number;
  items: PrizeTicketItem[];
  prizeCents: number;
}

/** GET /v1/me/prizes?date=YYYY-MM-DD */
export interface PrizesReport {
  /** YYYY-MM-DD. */
  date: string;
  /** Na ordem da extração (hora) e do pule. */
  tickets: PrizeTicket[];
  totalPrizeCents: number;
}

/** Datas consultáveis (YYYY-MM-DD, Brasília), de hoje para trás. */
export const prizeDates = (nowIso: string): string[] => reportDates(nowIso, PRIZES_MAX_DAYS_BACK);

/** A data (YYYY-MM-DD) está entre hoje e PRIZES_MAX_DAYS_BACK dias atrás, em Brasília. */
export const isPrizeDate = (nowIso: string, date: string): boolean => isReportDate(nowIso, date, PRIZES_MAX_DAYS_BACK);

/** Código da pule digitado no Reclame: o número do comprovante (só dígitos, sem zeros à esquerda, até 12). */
export const PULE_CODE_MAX_DIGITS = 12;
export const PULE_CODE_PATTERN = /^[1-9]\d{0,11}$/;

/** "562 229 026" ou " 562229026 " -> "562229026"; null se não for um código válido. */
export function normalizePuleCode(raw: string): string | null {
  const code = raw.replace(/\s+/g, '');
  return PULE_CODE_PATTERN.test(code) ? code : null;
}

/**
 * GET /v1/me/prizes/claim?pule=N (Premiadas > Reclame): situação do prêmio de uma pule do jogador. Pule que
 * não existe, de outro jogador ou sem prêmio respondem igual ("não encontrado"), sem revelar qual é o caso.
 */
export type PrizeClaim = { status: 'paid'; /** YYYY-MM-DD (Brasília). */ paidOn: string } | { status: 'not_found' };
