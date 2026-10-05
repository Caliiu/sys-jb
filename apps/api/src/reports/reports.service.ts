import { Inject, Injectable } from '@nestjs/common';
import {
  type BalanceReport,
  isReportDate,
  MAX_PULE_NUMBER,
  type LotteryMovementReport,
  PULE_LIST_LIMIT,
  type PuleDetail,
  type PuleList,
  type PuleSummary,
  REPORT_DAYS_BACK,
} from '@sysjb/contracts';
import type { UserSession } from '../auth/session.types.js';
import { AppError, Errors } from '../common/app-error.js';
import { hasSqlState } from '../common/prisma-errors.js';
import { DatabaseService } from '../database/database.service.js';
import { toPublicBet } from '../fazendinha/fazendinha.service.js';
import { toPublicTicket } from '../lotteries/lotteries.service.js';
import { QuotesService } from '../quotes/quotes.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';

/**
 * Movimentações de aposta (débito do pule e devolução do pule cancelado: as vendas do dia são as líquidas) e de comissão
 * (crédito na aposta e estorno no cancelamento); o resto entra em "Crédito / débitos".
 */
const SALE_KINDS = ['FAZENDINHA_BET', 'LOTTERY_BET', 'LOTTERY_REFUND'];
const COMMISSION_KINDS = ['COMMISSION', 'COMMISSION_REVERSAL'];
/** Prêmio pago pela apuração: listado por pule em "Prêmios". */
const PRIZE_KIND = 'PRIZE';
/** Rótulo mostrado ao jogador: pelo tipo, nunca o motivo digitado no painel (pode ser interno). */
const ENTRY_LABELS: Record<string, string> = {
  MANUAL_ADJUSTMENT: 'Ajuste',
  OPERATOR_CREDIT: 'Crédito',
  OPENING_BALANCE: 'Saldo inicial',
};

const DAY_MS = 86_400_000;

/** Início e fim (exclusivo) do dia em Brasília (sem horário de verão: sempre -03:00). */
function dayBounds(date: string) {
  const start = new Date(`${date}T00:00:00-03:00`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const fromDate = (date: Date) => date.toISOString().slice(0, 10);

/** Carteira de apostas: saldo + prêmios + bônus (as bolsas que o livro de movimentações registra). */
const jbDelta = (row: { balanceJbDelta: bigint | null; prizesJbDelta: bigint | null; bonusJbDelta: bigint | null }) =>
  Number((row.balanceJbDelta ?? 0n) + (row.prizesJbDelta ?? 0n) + (row.bonusJbDelta ?? 0n));

const outOfWindow = (daysBack: number) =>
  new AppError(400, 'VALIDATION_ERROR', `Consulte de hoje até ${daysBack} dias atrás.`, [
    { field: 'date', message: 'Data fora do período de consulta.' },
  ]);
const puleNotFound = () => new AppError(404, 'NOT_FOUND', 'Pule não encontrada.');

/**
 * Relatórios do jogador da sessão (Consultar saldo, Consultar pule, Movimento loterias). Toda consulta filtra
 * pelo usuário da sessão, além do RLS da banca: um jogador nunca enxerga pules ou movimentações de outro.
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(QuotesService) private readonly quotes: QuotesService,
  ) {}

  /** Consultar saldo: movimento da carteira de apostas no dia, fechando com o saldo do livro. */
  balance(tenant: ResolvedTenant, session: UserSession, date: string): Promise<BalanceReport> {
    this.assertDate(date, REPORT_DAYS_BACK.balance);
    const { start, end } = dayBounds(date);
    const owner = { tenantId: tenant.id, userId: session.userId };
    const deltas = { balanceJbDelta: true, prizesJbDelta: true, bonusJbDelta: true } as const;

    return this.db.withTenant(tenant.id, async (tx) => {
      const today = { ...owner, createdAt: { gte: start, lt: end } };
      const [before, byKind, entries, prizeEntries] = await Promise.all([
        tx.walletEntry.aggregate({ where: { ...owner, createdAt: { lt: start } }, _sum: deltas }),
        tx.walletEntry.groupBy({
          by: ['kind'],
          where: { ...today, kind: { in: [...SALE_KINDS, ...COMMISSION_KINDS] } },
          _sum: deltas,
        }),
        tx.walletEntry.findMany({
          where: { ...today, kind: { notIn: [...SALE_KINDS, ...COMMISSION_KINDS, PRIZE_KIND] } },
          select: { kind: true, ...deltas },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        tx.walletEntry.findMany({
          where: { ...today, kind: PRIZE_KIND },
          select: { ...deltas, pulePrize: { select: { puleNumber: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      ]);

      const sumOf = (kinds: string[]) =>
        byKind.filter((row) => kinds.includes(row.kind)).reduce((sum, row) => sum + jbDelta(row._sum), 0);
      const salesCents = -sumOf(SALE_KINDS);
      const commissionCents = sumOf(COMMISSION_KINDS);
      const prizes = prizeEntries.map((row) => ({
        puleNumber: row.pulePrize?.puleNumber ?? 0,
        amountCents: jbDelta(row),
      }));
      const lines = entries
        .map((row) => ({ label: ENTRY_LABELS[row.kind] ?? 'Outros', amountCents: jbDelta(row) }))
        .filter((line) => line.amountCents !== 0);
      const previousCents = jbDelta(before._sum);
      const sum = (rows: Array<{ amountCents: number }>) => rows.reduce((total, row) => total + row.amountCents, 0);

      return {
        date,
        salesCents,
        commissionCents,
        prizes,
        entries: lines,
        sentCents: 0,
        receivedCents: 0,
        previousCents,
        balanceCents: previousCents - salesCents + commissionCents + sum(prizes) + sum(lines),
      };
    });
  }

  /** Movimento loterias: total apostado pelo jogador em cada extração do dia (Loterias + Fazendinha; sem canceladas). */
  lotteryMovement(tenant: ResolvedTenant, session: UserSession, date: string): Promise<LotteryMovementReport> {
    this.assertDate(date, REPORT_DAYS_BACK.lotteryMovement);
    const where = { tenantId: tenant.id, userId: session.userId, drawDate: toDate(date) };

    return this.db.withTenant(tenant.id, async (tx) => {
      const [tickets, bets] = await Promise.all([
        tx.lotteryTicket.groupBy({
          by: ['drawCode', 'drawHour'],
          where: { ...where, canceledAt: null },
          _sum: { totalCents: true },
        }),
        tx.fazendinhaBet.groupBy({ by: ['drawCode', 'drawHour'], where, _sum: { totalCents: true } }),
      ]);
      const rows = new Map<string, { code: string; hour: number; totalCents: number }>();
      for (const row of [...tickets, ...bets]) {
        const current = rows.get(row.drawCode) ?? { code: row.drawCode, hour: row.drawHour, totalCents: 0 };
        current.totalCents += Number(row._sum.totalCents ?? 0n);
        current.hour = Math.min(current.hour, row.drawHour);
        rows.set(row.drawCode, current);
      }
      return {
        date,
        rows: [...rows.values()]
          .sort((a, b) => a.hour - b.hour || a.code.localeCompare(b.code))
          .map(({ code, totalCents }) => ({ code, totalCents })),
      };
    });
  }

  /** Consultar pule por data: pules vendidas no dia (mais recentes primeiro) e os totais. */
  pules(tenant: ResolvedTenant, session: UserSession, date: string): Promise<PuleList> {
    this.assertDate(date, REPORT_DAYS_BACK.pules);
    const { start, end } = dayBounds(date);
    const where = { tenantId: tenant.id, userId: session.userId, createdAt: { gte: start, lt: end } };
    const select = { puleNumber: true, drawCode: true, drawDate: true, totalCents: true, createdAt: true } as const;
    const page = {
      orderBy: [{ createdAt: 'desc' as const }, { puleNumber: 'desc' as const }],
      take: PULE_LIST_LIMIT + 1,
    };

    return this.db.withTenant(tenant.id, async (tx) => {
      const [tickets, bets, validTotal, canceledTotal, betTotal] = await Promise.all([
        tx.lotteryTicket.findMany({ where, select: { ...select, canceledAt: true }, ...page }),
        tx.fazendinhaBet.findMany({ where, select, ...page }),
        tx.lotteryTicket.aggregate({ where: { ...where, canceledAt: null }, _sum: { totalCents: true } }),
        tx.lotteryTicket.aggregate({ where: { ...where, canceledAt: { not: null } }, _sum: { totalCents: true } }),
        tx.fazendinhaBet.aggregate({ where, _sum: { totalCents: true } }),
      ]);
      const summary =
        (game: PuleSummary['game']) =>
        (row: (typeof bets)[number] & { canceledAt?: Date | null }): PuleSummary => ({
          puleNumber: row.puleNumber,
          game,
          code: row.drawCode,
          createdAt: row.createdAt.toISOString(),
          drawDate: fromDate(row.drawDate),
          status: row.canceledAt ? 'canceled' : 'registered',
          totalCents: Number(row.totalCents),
        });
      const all = [...tickets.map(summary('lotteries')), ...bets.map(summary('fazendinha'))].sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.puleNumber - a.puleNumber,
      );
      return {
        date,
        registeredCents: Number((validTotal._sum.totalCents ?? 0n) + (betTotal._sum.totalCents ?? 0n)),
        canceledCents: Number(canceledTotal._sum.totalCents ?? 0n),
        pules: all.slice(0, PULE_LIST_LIMIT),
        truncated: all.length > PULE_LIST_LIMIT,
      };
    });
  }

  /**
   * Consultar pule por código: o recibo, se a pule for do jogador. Inexistente e de outro jogador respondem
   * igual (404), sem revelar qual é o caso.
   */
  pule(tenant: ResolvedTenant, session: UserSession, puleNumber: number): Promise<PuleDetail> {
    const where = { tenantId: tenant.id, userId: session.userId, puleNumber };

    return this.db.withTenant(tenant.id, async (tx) => {
      const [ticket, bet, user] = await Promise.all([
        tx.lotteryTicket.findFirst({ where, include: { items: { orderBy: { position: 'asc' } } } }),
        tx.fazendinhaBet.findFirst({
          where,
          include: { numbers: { select: { number: true }, orderBy: { number: 'asc' } } },
        }),
        tx.user.findFirst({ where: { tenantId: tenant.id, id: session.userId }, select: { displayId: true } }),
      ]);
      if (!user) throw Errors.sessionInvalid();
      if (ticket) {
        return {
          game: 'lotteries',
          ticket: toPublicTicket(ticket, user.displayId),
          cancellable: !ticket.canceledAt && ticket.closesAt.getTime() > Date.now(),
          canceledAt: ticket.canceledAt?.toISOString() ?? null,
        };
      }
      if (bet) {
        const { tableLabel } = await this.quotes.load(tx, tenant.id);
        return {
          game: 'fazendinha',
          bet: toPublicBet(
            bet,
            bet.numbers.map((n) => n.number),
            user.displayId,
            tableLabel,
          ),
        };
      }
      throw puleNotFound();
    });
  }

  /**
   * Cancelar pule (só Loterias), pelo próprio jogador e antes do horário limite. O banco faz tudo numa transação
   * (lottery_cancel): devolve a aposta às mesmas bolsas, marca a pule e estorna a comissão de quem indicou. Pule de
   * outro jogador ou inexistente responde 404, como a consulta; repetir o pedido responde 409.
   */
  async cancelPule(tenant: ResolvedTenant, session: UserSession, puleNumber: number): Promise<PuleDetail> {
    // O número da pule é integer no banco: acima disso, a pule não existe.
    if (puleNumber > MAX_PULE_NUMBER) throw puleNotFound();
    try {
      await this.db.withTenant(
        tenant.id,
        (tx) => tx.$queryRaw`SELECT lottery_cancel(${puleNumber}::integer, ${session.userId}::uuid)::text AS id`,
      );
    } catch (error) {
      if (hasSqlState(error, 'P0002')) throw puleNotFound();
      if (hasSqlState(error, 'SJ005')) throw new AppError(409, 'CONFLICT', 'Esta pule já foi cancelada.');
      if (hasSqlState(error, 'SJ002')) {
        throw new AppError(409, 'DRAW_CLOSED', 'O horário de venda desta extração já encerrou.');
      }
      throw error;
    }
    return this.pule(tenant, session, puleNumber);
  }

  private assertDate(date: string, daysBack: number): void {
    if (!isReportDate(new Date().toISOString(), date, daysBack)) throw outOfWindow(daysBack);
  }
}
