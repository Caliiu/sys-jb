import { Inject, Injectable } from '@nestjs/common';
import type { AdminGeneralReport, AdminGeneralReportRow, GeneralReportSort } from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { AppError } from '../common/app-error.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { GeneralReportQuery } from './admin.schemas.js';

const DAY_MS = 86_400_000;

/** Coluna SQL de cada ordenação (lista fixa: o valor da requisição nunca vai para o SQL). */
const SORT_COLUMNS: Record<GeneralReportSort, Prisma.Sql> = {
  name: Prisma.raw('r."name"'),
  type: Prisma.raw('r."is_promoter"'),
  sales: Prisma.raw('r."sales"'),
  commission: Prisma.raw('r."commission"'),
  referralCommission: Prisma.raw('r."referral_commission"'),
  prizes: Prisma.raw('r."prizes"'),
  other: Prisma.raw('r."other"'),
  net: Prisma.raw('r."net"'),
};

interface ReportRow {
  id: string;
  display_id: number;
  name: string;
  is_promoter: boolean;
  sales: bigint;
  commission: bigint;
  referral_commission: bigint;
  prizes: bigint;
  other: bigint;
  net: bigint;
  gross_net: bigint;
}

const toRow = (row: ReportRow): AdminGeneralReportRow => ({
  player: { id: row.id, displayId: row.display_id, name: row.name },
  type: row.is_promoter ? 'promoter' : 'player',
  salesCents: Number(row.sales),
  commissionCents: Number(row.commission),
  referralCommissionCents: Number(row.referral_commission),
  prizesCents: Number(row.prizes),
  otherCents: Number(row.other),
  netCents: Number(row.net),
  grossNetCents: Number(row.gross_net),
});

/**
 * Relatório geral da banca do operador: uma linha por usuário com movimento no período, do ponto de vista da banca.
 * Só leitura, numa consulta por página (contagem + linhas); toda parte filtra pela banca, além do RLS da transação, e o
 * SQL é sempre parametrizado.
 *
 * - vendas: pules de Loterias e Fazendinha vendidos no período (data da venda);
 * - comissão / comissão amigo: pagamentos de comissão creditados no período, divididos como no fechamento
 *   (amigo = apostado × % indique e ganhe; o resto do pagamento é a parte de promotor), somando o que foi pago;
 * - prêmios: pules premiadas apuradas no período (vazio até a apuração existir);
 * - outros: créditos pelo painel e ajustes manuais no período (todas as bolsas);
 * - líquido = vendas − prêmios − comissão − comissão amigo; líquido geral = líquido − outros.
 */
@Injectable()
export class GeneralReportService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  report(tenant: ResolvedTenant, query: GeneralReportQuery): Promise<AdminGeneralReport> {
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
      const period = (column: Prisma.Sql) => Prisma.sql`${column} >= ${start} AND ${column} < ${end}`;

      const filters = [
        query.userId ? Prisma.sql`u."id" = ${query.userId}::uuid` : null,
        query.promoterId
          ? Prisma.sql`(u."id" = ${query.promoterId}::uuid OR u."referred_by_user_id" = ${query.promoterId}::uuid)`
          : null,
        query.type === 'promoter' ? Prisma.sql`u."promoter_commission_bps" IS NOT NULL` : null,
        query.type === 'player' ? Prisma.sql`u."promoter_commission_bps" IS NULL` : null,
      ].filter((filter): filter is Prisma.Sql => filter !== null);
      const where = filters.length > 0 ? Prisma.sql`AND ${Prisma.join(filters, ' AND ')}` : Prisma.empty;

      const report = Prisma.sql`
        WITH sales AS (
          SELECT x."user_id", sum(x."total_cents") AS v FROM (
            SELECT t."user_id", t."total_cents" FROM "lottery_tickets" t
            WHERE t."tenant_id" = ${tenantId} AND ${period(Prisma.sql`t."created_at"`)}
            UNION ALL
            SELECT b."user_id", b."total_cents" FROM "fazendinha_bets" b
            WHERE b."tenant_id" = ${tenantId} AND ${period(Prisma.sql`b."created_at"`)}
          ) x GROUP BY x."user_id"
        ),
        prizes AS (
          SELECT p."user_id", sum(p."prize_cents") AS v FROM "pule_prizes" p
          WHERE p."tenant_id" = ${tenantId} AND ${period(Prisma.sql`p."settled_at"`)}
          GROUP BY p."user_id"
        ),
        commissions AS (
          SELECT e."user_id", sum(c."amount_cents") AS total,
                 sum(c."wagered_cents" * c."referral_rate_bps" / 10000) AS referral
          FROM "wallet_entries" e
          JOIN "commission_payouts" c ON c."tenant_id" = e."tenant_id" AND c."id" = e."commission_payout_id"
          WHERE e."tenant_id" = ${tenantId} AND e."kind" = 'COMMISSION' AND ${period(Prisma.sql`e."created_at"`)}
          GROUP BY e."user_id"
        ),
        others AS (
          SELECT e."user_id",
                 sum(e."balance_jb_delta" + e."prizes_jb_delta" + e."bonus_jb_delta" + e."balance_games_delta") AS v
          FROM "wallet_entries" e
          WHERE e."tenant_id" = ${tenantId} AND e."kind" IN ('OPERATOR_CREDIT', 'MANUAL_ADJUSTMENT')
            AND ${period(Prisma.sql`e."created_at"`)}
          GROUP BY e."user_id"
        ),
        ids AS (
          SELECT "user_id" FROM sales UNION SELECT "user_id" FROM prizes
          UNION SELECT "user_id" FROM commissions UNION SELECT "user_id" FROM others
        ),
        base AS (
          SELECT u."id", u."display_id", u."name", u."promoter_commission_bps" IS NOT NULL AS is_promoter,
                 COALESCE(s.v, 0) AS sales,
                 COALESCE(c.total, 0) - COALESCE(c.referral, 0) AS commission,
                 COALESCE(c.referral, 0) AS referral_commission,
                 COALESCE(p.v, 0) AS prizes,
                 COALESCE(o.v, 0) AS other
          FROM ids
          JOIN "users" u ON u."tenant_id" = ${tenantId} AND u."id" = ids."user_id"
          LEFT JOIN sales s ON s."user_id" = u."id"
          LEFT JOIN prizes p ON p."user_id" = u."id"
          LEFT JOIN commissions c ON c."user_id" = u."id"
          LEFT JOIN others o ON o."user_id" = u."id"
          WHERE TRUE ${where}
        ),
        r AS (
          SELECT base.*,
                 base.sales - base.prizes - base.commission - base.referral_commission AS net,
                 base.sales - base.prizes - base.commission - base.referral_commission - base.other AS gross_net
          FROM base
        )`;

      const [count] = await tx.$queryRaw<Array<{ total: bigint }>>`${report} SELECT count(*) AS total FROM r`;
      const total = Number(count?.total ?? 0n);
      const base = { from: query.from, to: query.to, page: query.page, pageSize: query.pageSize, total };
      if (total === 0) return { ...base, items: [], totalPages: 1 };

      const direction = Prisma.raw(query.dir === 'asc' ? 'ASC' : 'DESC');
      const rows = await tx.$queryRaw<ReportRow[]>`
        ${report}
        SELECT * FROM r
        ORDER BY ${SORT_COLUMNS[query.sort]} ${direction}, r."display_id" ASC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;

      return { ...base, items: rows.map(toRow), totalPages: Math.max(1, Math.ceil(total / query.pageSize)) };
    });
  }
}
