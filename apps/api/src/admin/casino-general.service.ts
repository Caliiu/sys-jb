import { Inject, Injectable } from '@nestjs/common';
import type { AdminCasinoGeneralReport, CasinoGeneralRow } from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { AppError } from '../common/app-error.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { CasinoGeneralQuery } from './admin.schemas.js';

const DAY_MS = 86_400_000;

interface ReportRow {
  id: string;
  display_id: number;
  name: string;
  is_promoter: boolean;
  turnover: bigint;
  payout: bigint;
}

const toRow = (row: ReportRow): CasinoGeneralRow => {
  const turnoverCents = Number(row.turnover);
  const payoutCents = Number(row.payout);
  return {
    player: { id: row.id, displayId: row.display_id, name: row.name },
    type: row.is_promoter ? 'promoter' : 'player',
    turnoverCents,
    payoutCents,
    netCents: turnoverCents - payoutCents,
  };
};

/**
 * Geral cassino da banca do operador: uma linha por usuário com rodada no período, do ponto de vista da banca.
 * Apostado e pago são as rodadas do webhook (casino_transactions), como no fechamento cassino; líquido = apostado −
 * pago. Com promotor, só os indicados dele (a base da comissão de cassino). Só leitura, SQL parametrizado, e toda parte
 * filtra pela banca, além do RLS da transação.
 */
@Injectable()
export class CasinoGeneralService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  report(tenant: ResolvedTenant, query: CasinoGeneralQuery): Promise<AdminCasinoGeneralReport> {
    return this.db.withTenant(tenant.id, async (tx) => {
      if (query.promoterId) {
        const promoter = await tx.user.findFirst({
          where: { tenantId: tenant.id, id: query.promoterId, promoterCommissionBps: { not: null } },
          select: { id: true },
        });
        if (!promoter) throw new AppError(404, 'NOT_FOUND', 'Promotor não encontrado.');
      }

      // Dias de Brasília (sempre -03:00, sem horário de verão), fim exclusivo.
      const start = new Date(`${query.from}T00:00:00-03:00`);
      const end = new Date(new Date(`${query.to}T00:00:00-03:00`).getTime() + DAY_MS);
      const tenantId = Prisma.sql`${tenant.id}::uuid`;

      const filters = [
        query.userId ? Prisma.sql`u."id" = ${query.userId}::uuid` : null,
        query.promoterId ? Prisma.sql`u."referred_by_user_id" = ${query.promoterId}::uuid` : null,
        query.type === 'promoter' ? Prisma.sql`u."promoter_commission_bps" IS NOT NULL` : null,
        query.type === 'player' ? Prisma.sql`u."promoter_commission_bps" IS NULL` : null,
      ].filter((filter): filter is Prisma.Sql => filter !== null);
      const where = filters.length > 0 ? Prisma.sql`AND ${Prisma.join(filters, ' AND ')}` : Prisma.empty;

      const rows = await tx.$queryRaw<ReportRow[]>`
        WITH played AS (
          SELECT t."user_id", sum(t."bet_cents")::bigint AS turnover, sum(t."win_cents")::bigint AS payout
          FROM "casino_transactions" t
          WHERE t."tenant_id" = ${tenantId} AND t."created_at" >= ${start} AND t."created_at" < ${end}
          GROUP BY t."user_id"
        )
        SELECT u."id", u."display_id", u."name", u."promoter_commission_bps" IS NOT NULL AS is_promoter,
               p.turnover, p.payout
        FROM played p
        JOIN "users" u ON u."tenant_id" = ${tenantId} AND u."id" = p."user_id"
        WHERE TRUE ${where}
        ORDER BY p.turnover DESC, u."display_id" ASC`;

      const items = rows.map(toRow);
      const turnoverCents = items.reduce((total, row) => total + row.turnoverCents, 0);
      const payoutCents = items.reduce((total, row) => total + row.payoutCents, 0);
      return {
        from: query.from,
        to: query.to,
        rows: items,
        totals: { turnoverCents, payoutCents, netCents: turnoverCents - payoutCents },
        available: true,
      };
    });
  }
}
