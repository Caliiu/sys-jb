import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminCasinoClosing,
  type CasinoClosingMonth,
  type CasinoClosingRow,
  type CasinoClosingTotals,
  casinoClosingMonths,
} from '@sysjb/contracts';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { CasinoClosingQuery } from './admin.schemas.js';
import { PROMOTER_OPTIONS_MAX } from './promoters.repository.js';

const ZERO: CasinoClosingTotals = { turnoverCents: 0, payoutCents: 0, ggrCents: 0, commissionCents: 0 };

/** O mês já terminou: é anterior ao mês corrente (Brasília). */
const endedAt = (month: string, current: string) => month < current;

/**
 * Fechamento mensal do cassino: cada promotor recebe a % de cassino dele sobre o GGR (turnover − payout) dos indicados
 * no mês; GGR negativo paga 0. O sistema ainda não tem cassino (nenhuma aposta ou prêmio para somar), então os valores
 * vêm zerados e marcados como indisponíveis, e não há o que pagar. O detalhamento já lista os promotores da banca com a
 * % de cassino de cada um (onde o Gerente confere o que vai valer). Só leitura; toda consulta filtra pela banca, além
 * do RLS da transação.
 */
@Injectable()
export class CasinoClosingService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  report(tenant: ResolvedTenant, query: CasinoClosingQuery): Promise<AdminCasinoClosing> {
    const { previous, current } = casinoClosingMonths(new Date().toISOString());
    const card = (month: string): CasinoClosingMonth => ({
      month,
      ended: endedAt(month, current),
      totals: ZERO,
      promotersWithCommission: 0,
    });

    return this.db.withTenant(tenant.id, async (tx) => {
      let detail: AdminCasinoClosing['detail'] = null;
      if (query.month) {
        const promoters = await tx.user.findMany({
          where: { tenantId: tenant.id, promoterCommissionBps: { not: null } },
          select: {
            id: true,
            displayId: true,
            name: true,
            casinoCommissionBps: true,
            _count: { select: { referrals: true } },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take: PROMOTER_OPTIONS_MAX,
        });
        const rows = promoters.map(
          (p): CasinoClosingRow => ({
            promoter: { id: p.id, displayId: p.displayId, name: p.name },
            casinoCommissionBps: p.casinoCommissionBps,
            referralsCount: p._count.referrals,
            ...ZERO,
          }),
        );
        detail = { month: query.month, ended: endedAt(query.month, current), rows, totals: ZERO };
      }
      return { months: [card(previous), card(current)], detail, available: false };
    });
  }
}
