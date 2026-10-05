/**
 * Premiadas > Consultar premiadas: pules premiadas do jogador num dia (data do jogo), gravadas pela apuração de
 * prêmios. A apuração paga na bolsa de prêmios depois da carência (o resultado precisa ficar alguns minutos sem
 * correção); até lá a pule não aparece aqui.
 */

import { FAZENDINHA_MODE_CODES } from './quotes.js';
import type { FazendinhaModeId } from './fazendinha.js';
import { findLotteryModality, findLotteryPlacement } from './lotteries.js';
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

/** Item premiado de Loterias como no comprovante: "MILHAR 1 PRÊMIO". */
export function lotteryPrizeLabel(modality: string, placement: string): string {
  const m = findLotteryModality(modality)?.label ?? modality.toUpperCase();
  const p = findLotteryPlacement(placement)?.label ?? placement;
  return `${m} ${p}`;
}

/** Fazendinha: "FZG1 1/1" = Fazendinha, modalidade (G/D/C), valor por número em reais e a colocação (só o 1º prêmio). */
export const fazendinhaPrizeLabel = (mode: FazendinhaModeId, stakeCents: number) =>
  `FZ${FAZENDINHA_MODE_CODES[mode][0]}${stakeCents % 100 === 0 ? stakeCents / 100 : (stakeCents / 100).toFixed(2).replace('.', ',')} 1/1`;

/**
 * Caminho da tela com as premiadas do dia (YYYY-MM-DD) no app da banca. Fica aqui porque a notificação de "pule
 * premiada", montada pela API, abre a mesma tela.
 */
export const prizesViewPath = (date: string) => `/premiadas/consultar/${date}`;

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
