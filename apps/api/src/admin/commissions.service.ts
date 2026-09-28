import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminCommissionClosing,
  type AdminCommissionMonth,
  type AdminCommissionRow,
  type AdminCommissionSettings,
  brasiliaNow,
} from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { AppError, Errors } from '../common/app-error.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { recordAudit } from './audit.js';
import type { AuthenticatedOperator } from './operator.types.js';

/** Linha de commission_month_totals (bigint do PostgreSQL chega como BigInt). */
interface TotalsRow {
  user_id: string;
  wagered_cents: bigint;
  referral_rate_bps: number;
  promoter_rate_bps: number;
  amount_cents: bigint;
  blocked: boolean;
}

const firstDay = (month: string) => new Date(`${month}-01T00:00:00Z`);
const toMonth = (date: Date) => date.toISOString().slice(0, 7);

/** Mês corrente em Brasília (YYYY-MM): só meses anteriores a ele podem ser fechados. */
function currentMonth(): string {
  const { year, month } = brasiliaNow(new Date().toISOString());
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** O SQLSTATE vem nos metadados do erro do driver; a mensagem do banco não é usada. */
const hasSqlState = (error: unknown, sqlState: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && JSON.stringify(error.meta ?? {}).includes(sqlState);

const byAmount = (a: AdminCommissionRow, b: AdminCommissionRow) =>
  b.amountCents - a.amountCents || b.wageredCents - a.wageredCents || a.user.name.localeCompare(b.user.name);

/**
 * Comissões da banca: % do "Indique e ganhe" (definida pelo Gerente) e fechamento mensal. Quem indicou
 * ganha, sobre o valor apostado pelos indicados, a % de indicação e, se for promotor, também a dele.
 * O cálculo e o crédito ficam no banco (commission_month_totals / commission_close_month).
 */
@Injectable()
export class CommissionsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  getSettings(tenant: ResolvedTenant): Promise<AdminCommissionSettings> {
    return this.db.withTenant(tenant.id, (tx) => this.settings(tx, tenant.id));
  }

  /** Altera a % de indicação. Repetir o mesmo valor é aceito sem efeito (e sem auditoria). */
  setSettings(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    referralCommissionBps: number,
  ): Promise<AdminCommissionSettings> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const previous = (await this.settings(tx, tenant.id)).referralCommissionBps;
      if (previous !== referralCommissionBps) {
        await tx.tenantSettings.upsert({
          where: { tenantId: tenant.id },
          create: { tenantId: tenant.id, referralCommissionBps },
          update: { referralCommissionBps },
        });
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: 'commission.rate',
          targetType: 'tenant',
          targetId: tenant.id,
          details: { fields: ['referralCommissionBps'], from: previous, to: referralCommissionBps },
        });
      }
      return { referralCommissionBps };
    });
  }

  month(tenant: ResolvedTenant, month: string): Promise<AdminCommissionMonth> {
    return this.db.withTenant(tenant.id, (tx) => this.loadMonth(tx, tenant.id, month));
  }

  /** Fecha o mês: grava o fechamento, os pagamentos e credita o Saldo, tudo numa transação. */
  async close(tenant: ResolvedTenant, operator: AuthenticatedOperator, month: string): Promise<AdminCommissionMonth> {
    try {
      return await this.db.withTenant(tenant.id, async (tx) => {
        await tx.$queryRaw`SELECT commission_close_month(${firstDay(month)}::date, ${operator.id}::uuid)::text AS id`;
        const result = await this.loadMonth(tx, tenant.id, month);
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: 'commission.close',
          targetType: 'tenant',
          targetId: tenant.id,
          details: { fields: ['month'], month, amount: result.totals.paidCents },
        });
        return result;
      });
    } catch (error) {
      if (hasSqlState(error, '23505')) throw new AppError(409, 'CONFLICT', 'Este mês já foi fechado.');
      if (hasSqlState(error, 'SJ004')) throw new AppError(409, 'CONFLICT', 'O mês ainda não terminou.');
      if (hasSqlState(error, '42501')) throw Errors.permissionDenied();
      throw error;
    }
  }

  async closings(tenant: ResolvedTenant): Promise<AdminCommissionClosing[]> {
    const rows = await this.db.withTenant(tenant.id, (tx) =>
      tx.commissionClosing.findMany({
        where: { tenantId: tenant.id },
        include: { operator: { select: { name: true } } },
        orderBy: { month: 'desc' },
        take: 24,
      }),
    );
    return rows.map((row) => ({
      month: toMonth(row.month),
      closedAt: row.closedAt.toISOString(),
      operatorName: row.operator.name,
      totalPaidCents: Number(row.totalPaidCents),
    }));
  }

  private async settings(tx: TenantTx, tenantId: string): Promise<AdminCommissionSettings> {
    const row = await tx.tenantSettings.findUnique({ where: { tenantId }, select: { referralCommissionBps: true } });
    return { referralCommissionBps: row?.referralCommissionBps ?? 0 };
  }

  /** Mês fechado: o que foi gravado. Mês aberto: prévia com os percentuais de agora. */
  private async loadMonth(tx: TenantTx, tenantId: string, month: string): Promise<AdminCommissionMonth> {
    const closing = await tx.commissionClosing.findUnique({
      where: { tenantId_month: { tenantId, month: firstDay(month) } },
      include: {
        operator: { select: { name: true } },
        payouts: { include: { user: { select: { id: true, displayId: true, name: true, status: true } } } },
      },
    });

    if (closing) {
      const rows = closing.payouts
        .map((p) => ({
          user: p.user,
          wageredCents: Number(p.wageredCents),
          referralRateBps: p.referralRateBps,
          promoterRateBps: p.promoterRateBps,
          amountCents: Number(p.amountCents),
          status: p.status,
        }))
        .sort(byAmount);
      return {
        month,
        closed: {
          closedAt: closing.closedAt.toISOString(),
          operatorName: closing.operator.name,
          totalPaidCents: Number(closing.totalPaidCents),
        },
        canClose: false,
        rows,
        totals: totals(rows),
      };
    }

    const computed = await tx.$queryRaw<TotalsRow[]>`SELECT * FROM commission_month_totals(${firstDay(month)}::date)`;
    const users = await tx.user.findMany({
      where: { tenantId, id: { in: computed.map((r) => r.user_id) } },
      select: { id: true, displayId: true, name: true, status: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const rows = computed
      .map((r): AdminCommissionRow => {
        const amountCents = Number(r.amount_cents);
        return {
          user: byId.get(r.user_id)!,
          wageredCents: Number(r.wagered_cents),
          referralRateBps: r.referral_rate_bps,
          promoterRateBps: r.promoter_rate_bps,
          amountCents,
          status: r.blocked ? 'BLOCKED' : amountCents === 0 ? 'ZERO' : 'PAID',
        };
      })
      .sort(byAmount);
    return { month, closed: null, canClose: month < currentMonth(), rows, totals: totals(rows) };
  }
}

function totals(rows: AdminCommissionRow[]) {
  return {
    wageredCents: rows.reduce((sum, r) => sum + r.wageredCents, 0),
    paidCents: rows.filter((r) => r.status === 'PAID').reduce((sum, r) => sum + r.amountCents, 0),
  };
}
