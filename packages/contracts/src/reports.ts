/**
 * Relatórios do jogador (Relatórios > Consultar saldo, Consultar pule, Movimento loterias). Sempre do jogador
 * da sessão; datas em Brasília (YYYY-MM-DD). Valores em centavos.
 */

import type { Cents } from './index.js';
import type { PublicFazendinhaBet } from './fazendinha.js';
import { dayOffsetOf, drawDateOf } from './fazendinha.js';
import type { PublicLotteryTicket } from './lotteries.js';

/** Dias para trás (além de hoje) de cada consulta por data: as telas listam hoje e os anteriores. */
export const REPORT_DAYS_BACK = { balance: 7, lotteryMovement: 7, pules: 6 } as const;

/** Datas consultáveis (YYYY-MM-DD, Brasília), de hoje para trás. */
export function reportDates(nowIso: string, daysBack: number): string[] {
  return Array.from({ length: daysBack + 1 }, (_, i) => drawDateOf(nowIso, -i));
}

/** A data (YYYY-MM-DD) existe e está entre hoje e `daysBack` dias atrás, em Brasília. */
export function isReportDate(nowIso: string, date: string, daysBack: number): boolean {
  const offset = dayOffsetOf(nowIso, date);
  return offset !== null && offset <= 0 && offset >= -daysBack;
}

/**
 * GET /v1/me/reports/balance?date=: movimento da carteira de apostas (saldo + bônus + prêmios) no dia.
 * balanceCents = previousCents - salesCents + commissionCents + prêmios + entries + sentCents - receivedCents.
 */
export interface BalanceReport {
  date: string;
  /** T.VENDAS: apostas do dia (Loterias + Fazendinha). */
  salesCents: Cents;
  /** COMISSÃO recebida no dia. */
  commissionCents: Cents;
  /** PRÊMIOS pagos no dia (vazio até existir apuração de resultados). */
  prizes: Array<{ puleNumber: number; amountCents: Cents }>;
  /** CRÉDITO / DÉBITOS: ajustes e créditos do painel; positivo = crédito, negativo = débito. */
  entries: Array<{ label: string; amountCents: Cents }>;
  /** MANDOU: recargas do dia. */
  sentCents: Cents;
  /** RECEBEU: saques do dia. */
  receivedCents: Cents;
  /** SALDO ANT.: no início do dia. */
  previousCents: Cents;
  /** HAVER: no fim do dia (ou agora, se for hoje). */
  balanceCents: Cents;
}

/** GET /v1/me/reports/lottery-movement?date=: apostas do jogador para as extrações do dia, por extração. */
export interface LotteryMovementReport {
  date: string;
  /** Na ordem da hora da extração. */
  rows: Array<{ code: string; totalCents: Cents }>;
}

export type PuleGame = 'lotteries' | 'fazendinha';

/** Pule na lista de Consultar pule por data. */
export interface PuleSummary {
  puleNumber: number;
  game: PuleGame;
  /** Código da extração na venda (ex.: PT14). */
  code: string;
  /** ISO 8601 da venda. */
  createdAt: string;
  /** "Vale" (YYYY-MM-DD). */
  drawDate: string;
  /** Cancelada pelo jogador (só Loterias, antes do horário limite): o valor voltou para a carteira. */
  status: 'registered' | 'canceled';
  totalCents: Cents;
}

/** GET /v1/me/pules?date=: pules vendidas no dia (mais recentes primeiro) e os totais. */
export interface PuleList {
  date: string;
  /** Pules válidas do dia. */
  registeredCents: Cents;
  /** Pules do dia que o jogador cancelou. */
  canceledCents: Cents;
  pules: PuleSummary[];
  /** Há mais pules no dia do que a lista traz (os totais contam todos). */
  truncated: boolean;
}

/** Máximo de pules na lista de um dia. */
export const PULE_LIST_LIMIT = 200;

/**
 * GET /v1/me/pules/:puleNumber: recibo de uma pule do jogador (404 se não for dele ou não existir).
 * POST /v1/me/pules/:puleNumber/cancel: cancela a pule de Loterias até o horário limite e devolve o recibo atualizado.
 */
export type PuleDetail =
  | {
      game: 'lotteries';
      ticket: PublicLotteryTicket;
      /** Ainda dentro do horário de venda e não cancelada: pode ser cancelada. */
      cancellable: boolean;
      /** ISO 8601 do cancelamento; null = válida. */
      canceledAt: string | null;
    }
  | { game: 'fazendinha'; bet: PublicFazendinhaBet };
