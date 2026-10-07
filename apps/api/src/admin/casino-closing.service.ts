import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminCasinoClosing,
  type CasinoClosingDetail,
  type CasinoClosingMonth,
  type CasinoClosingPayResult,
  type CasinoClosingRow,
  type CasinoClosingStatus,
  casinoClosingMonths,
} from '@sysjb/contracts';
import { AppError, Errors } from '../common/app-error.js';
import { hasSqlState } from '../common/prisma-errors.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { CasinoClosingPayInput, CasinoClosingQuery } from './admin.schemas.js';
import { recordAudit } from './audit.js';
import type { AuthenticatedOperator } from './operator.types.js';

/** Linha do cálculo do mês (casino_commission_month) com o pagamento, se houve. Centavos em bigint. */
interface MonthRow {
  id: string;
  display_id: number;
  name: string;
  referrals: number;
  turnover_cents: bigint;
  payout_cents: bigint;
  ggr_cents: bigint;
  rate_bps: number;
  amount_cents: bigint;
  active: boolean;
  paid_at: Date | null;
}

/** "YYYY-MM" → primeiro dia do mês, como o banco guarda. */
const firstDay = (month: string) => `${month}-01`;

function statusOf(row: MonthRow, ended: boolean): CasinoClosingStatus {
  if (row.paid_at) return 'paid';
  if (!row.active) return 'blocked';
  if (!ended) return 'open';
  return row.amount_cents > 0n ? 'pending' : 'none';
}

/** Conta só o que vale pagar: promotor bloqueado que ainda não recebeu fica fora do total de comissão. */
const counts = (row: CasinoClosingRow) => row.status !== 'blocked';

function summarize(month: string, ended: boolean, rows: MonthRow[]): CasinoClosingDetail {
  const items = rows.map(
    (row): CasinoClosingRow => ({
      promoter: { id: row.id, displayId: row.display_id, name: row.name },
      casinoCommissionBps: row.rate_bps,
      referralsCount: row.referrals,
      turnoverCents: Number(row.turnover_cents),
      payoutCents: Number(row.payout_cents),
      ggrCents: Number(row.ggr_cents),
      commissionCents: Number(row.amount_cents),
      status: statusOf(row, ended),
      paidAt: row.paid_at?.toISOString() ?? null,
    }),
  );
  const sum = (pick: (row: CasinoClosingRow) => number, keep: (row: CasinoClosingRow) => boolean = () => true) =>
    items.filter(keep).reduce((total, row) => total + pick(row), 0);
  const pending = items.filter((row) => row.status === 'pending');
  return {
    month,
    ended,
    rows: items,
    totals: {
      turnoverCents: sum((row) => row.turnoverCents),
      payoutCents: sum((row) => row.payoutCents),
      ggrCents: sum((row) => row.ggrCents),
      commissionCents: sum((row) => row.commissionCents, counts),
    },
    paidCents: sum((row) => row.commissionCents, (row) => row.status === 'paid'),
    pendingCents: pending.reduce((total, row) => total + row.commissionCents, 0),
    pendingCount: pending.length,
  };
}

/**
 * Fechamento mensal do cassino: cada promotor recebe a % de cassino dele sobre o GGR (turnover − payout) dos indicados
 * no mês (Brasília); GGR negativo paga 0 e promotor bloqueado não recebe. O cálculo é do banco (casino_commission_month),
 * o mesmo que o pagamento usa; quem já recebeu aparece com os valores e a % gravados no pagamento (inclusive quem deixou
 * de ser promotor depois). Pagar é só do Gerente, só de mês encerrado, uma vez por promotor e mês (casino_commission_pay
 * confere tudo de novo, com o mês travado). Toda consulta filtra pela banca, além do RLS da transação.
 */
@Injectable()
export class CasinoClosingService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  report(tenant: ResolvedTenant, query: CasinoClosingQuery): Promise<AdminCasinoClosing> {
    const { previous, current } = casinoClosingMonths(new Date().toISOString());
    const ended = (month: string) => month < current;

    return this.db.withTenant(tenant.id, async (tx) => {
      // Um mês por vez: cada cálculo percorre as rodadas do mês (sem disputar a conexão da transação).
      const details = new Map<string, CasinoClosingDetail>();
      for (const month of new Set([previous, current, ...(query.month ? [query.month] : [])])) {
        details.set(month, summarize(month, ended(month), await this.monthRows(tx, month)));
      }
      const card = (month: string): CasinoClosingMonth => {
        const detail = details.get(month)!;
        return {
          month,
          ended: detail.ended,
          totals: detail.totals,
          promotersWithCommission: detail.rows.filter((row) => row.commissionCents > 0 && counts(row)).length,
          paidCents: detail.paidCents,
          pendingCents: detail.pendingCents,
          pendingCount: detail.pendingCount,
        };
      };
      return {
        months: [card(previous), card(current)],
        detail: query.month ? details.get(query.month)! : null,
      };
    });
  }

  /** Paga um promotor ou todos os pendentes do mês; audita cada pagamento na mesma transação. */
  async pay(
    tenant: ResolvedTenant,
    actor: AuthenticatedOperator,
    input: CasinoClosingPayInput,
  ): Promise<CasinoClosingPayResult> {
    try {
      return await this.db.withTenant(tenant.id, async (tx) => {
        const paid = await tx.$queryRaw<Array<{ paid_user_id: string; paid_cents: bigint }>>`
          SELECT "paid_user_id", "paid_cents"
          FROM "casino_commission_pay"(${actor.id}::uuid, ${firstDay(input.month)}::date,
                                       ${input.promoterId ?? null}::uuid)`;
        for (const row of paid) {
          await recordAudit(tx, {
            tenantId: tenant.id,
            operatorId: actor.id,
            action: 'casino.commission.pay',
            targetType: 'user',
            targetId: row.paid_user_id,
            details: { fields: ['casinoCommission'], amount: Number(row.paid_cents), month: input.month },
          });
        }
        return {
          paidCount: paid.length,
          paidCents: paid.reduce((total, row) => total + Number(row.paid_cents), 0),
        };
      });
    } catch (error) {
      if (hasSqlState(error, 'SJ020')) {
        throw new AppError(
          409,
          'CONFLICT',
          input.promoterId
            ? 'Nada a pagar para este promotor no mês (já recebeu, está bloqueado ou não tem comissão).'
            : 'Nada a pagar neste mês: todos os promotores com comissão já receberam.',
        );
      }
      if (hasSqlState(error, 'SJ004')) throw new AppError(409, 'CONFLICT', 'O mês ainda não terminou.');
      if (hasSqlState(error, '42501')) throw Errors.permissionDenied();
      throw error;
    }
  }

  private monthRows(tx: TenantTx, month: string): Promise<MonthRow[]> {
    const day = firstDay(month);
    return tx.$queryRaw<MonthRow[]>`
      WITH m AS (SELECT * FROM "casino_commission_month"(${day}::date)),
      p AS (
        SELECT * FROM "casino_commission_payouts"
        WHERE "tenant_id" = "app_current_tenant_id"() AND "month" = ${day}::date
      )
      SELECT u."id", u."display_id", u."name",
             (SELECT count(*) FROM "users" r
               WHERE r."tenant_id" = u."tenant_id" AND r."referred_by_user_id" = u."id")::int AS "referrals",
             COALESCE(p."turnover_cents", m."turnover_cents", 0)::bigint AS "turnover_cents",
             COALESCE(p."payout_cents", m."payout_cents", 0)::bigint AS "payout_cents",
             COALESCE(p."ggr_cents", m."ggr_cents", 0)::bigint AS "ggr_cents",
             COALESCE(p."rate_bps", m."rate_bps", 0)::int AS "rate_bps",
             COALESCE(p."amount_cents", m."amount_cents", 0)::bigint AS "amount_cents",
             COALESCE(m."active", u."status" = 'ACTIVE') AS "active",
             p."created_at" AS "paid_at"
      FROM m
      FULL JOIN p ON p."user_id" = m."user_id"
      JOIN "users" u ON u."tenant_id" = "app_current_tenant_id"() AND u."id" = COALESCE(m."user_id", p."user_id")
      ORDER BY u."name", u."id"`;
  }
}
