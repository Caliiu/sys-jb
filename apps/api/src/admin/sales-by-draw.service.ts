import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminSalesByDrawReport,
  type SalesByDrawRow,
  type SalesByDrawTotals,
  minutesToTime,
} from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { AppError } from '../common/app-error.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { SalesByDrawQuery } from './admin.schemas.js';

interface DrawRow {
  lottery: string;
  draw_hour: number;
  draw_code: string | null;
  tickets: bigint;
  lotteries: bigint | null;
  fazendinha: bigint | null;
  prizes: bigint | null;
  draw_minutes: number | null;
}

const EMPTY_TOTALS: SalesByDrawTotals = {
  tickets: 0,
  lotteriesCents: 0,
  fazendinhaCents: 0,
  salesCents: 0,
  prizesCents: 0,
  netCents: 0,
};

function toRow(row: DrawRow): SalesByDrawRow {
  const lotteriesCents = Number(row.lotteries ?? 0n);
  const fazendinhaCents = Number(row.fazendinha ?? 0n);
  const prizesCents = Number(row.prizes ?? 0n);
  return {
    lottery: row.lottery,
    hour: row.draw_hour,
    drawCode: row.draw_code ?? '',
    drawTime: row.draw_minutes === null ? null : minutesToTime(row.draw_minutes),
    tickets: Number(row.tickets),
    lotteriesCents,
    fazendinhaCents,
    salesCents: lotteriesCents + fazendinhaCents,
    prizesCents,
    netCents: lotteriesCents + fazendinhaCents - prizesCents,
  };
}

const sum = (rows: SalesByDrawRow[]): SalesByDrawTotals =>
  rows.reduce(
    (totals, row) => ({
      tickets: totals.tickets + row.tickets,
      lotteriesCents: totals.lotteriesCents + row.lotteriesCents,
      fazendinhaCents: totals.fazendinhaCents + row.fazendinhaCents,
      salesCents: totals.salesCents + row.salesCents,
      prizesCents: totals.prizesCents + row.prizesCents,
      netCents: totals.netCents + row.netCents,
    }),
    EMPTY_TOTALS,
  );

/**
 * Vendas por extração da banca do operador: pules de Loterias (sem os cancelados) e Fazendinha e os prêmios deles, por
 * sorteio (nome e hora da venda, que o banco não deixa mudar depois de vender), pela data do jogo. Só leitura, numa
 * consulta; toda parte filtra pela banca, além do RLS da transação, e o SQL é sempre parametrizado. São poucas linhas
 * (uma por sorteio da banca), então não há paginação.
 */
@Injectable()
export class SalesByDrawService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  report(tenant: ResolvedTenant, query: SalesByDrawQuery): Promise<AdminSalesByDrawReport> {
    return this.db.withTenant(tenant.id, async (tx) => {
      if (query.promoterId) {
        const promoter = await tx.user.findFirst({
          where: { tenantId: tenant.id, id: query.promoterId, promoterCommissionBps: { not: null } },
          select: { id: true },
        });
        if (!promoter) throw new AppError(404, 'NOT_FOUND', 'Promotor não encontrado.');
      }

      const tenantId = Prisma.sql`${tenant.id}::uuid`;
      // Pules do filtro: data do jogo no período e, se houver, do apostador ou dos indicados do promotor.
      const pules = (alias: Prisma.Sql) => Prisma.sql`
        ${alias}."tenant_id" = ${tenantId}
        AND ${alias}."draw_date" BETWEEN ${query.from}::date AND ${query.to}::date
        ${query.userId ? Prisma.sql`AND ${alias}."user_id" = ${query.userId}::uuid` : Prisma.empty}
        ${
          query.promoterId
            ? Prisma.sql`AND ${alias}."user_id" IN (
                SELECT u."id" FROM "users" u
                WHERE u."tenant_id" = ${tenantId} AND u."referred_by_user_id" = ${query.promoterId}::uuid)`
            : Prisma.empty
        }`;

      const rows = await tx.$queryRaw<DrawRow[]>`
        WITH sold AS (
          SELECT 'lotteries' AS game, t."lottery", t."draw_hour", t."draw_code", t."total_cents", t."created_at"
          FROM "lottery_tickets" t WHERE ${pules(Prisma.raw('t'))} AND t."canceled_at" IS NULL
          UNION ALL
          SELECT 'fazendinha' AS game, b."lottery", b."draw_hour", b."draw_code", b."total_cents", b."created_at"
          FROM "fazendinha_bets" b WHERE ${pules(Prisma.raw('b'))}
        ),
        sales AS (
          SELECT s."lottery", s."draw_hour",
                 -- Código da venda mais recente (o código do sorteio pode mudar no cadastro).
                 (array_agg(s."draw_code" ORDER BY s."created_at" DESC))[1] AS draw_code,
                 count(*) AS tickets,
                 sum(s."total_cents") FILTER (WHERE s.game = 'lotteries') AS lotteries,
                 sum(s."total_cents") FILTER (WHERE s.game = 'fazendinha') AS fazendinha
          FROM sold s GROUP BY s."lottery", s."draw_hour"
        ),
        prizes AS (
          SELECT p."lottery", p."draw_hour", sum(p."prize_cents") AS v
          FROM "pule_prizes" p WHERE ${pules(Prisma.raw('p'))}
          GROUP BY p."lottery", p."draw_hour"
        ),
        keys AS (
          SELECT "lottery", "draw_hour" FROM sales UNION SELECT "lottery", "draw_hour" FROM prizes
        )
        SELECT k."lottery", k."draw_hour", s.draw_code, COALESCE(s.tickets, 0) AS tickets, s.lotteries, s.fazendinha,
               pr.v AS prizes, d."draw_minutes"
        FROM keys k
        LEFT JOIN sales s ON s."lottery" = k."lottery" AND s."draw_hour" = k."draw_hour"
        LEFT JOIN prizes pr ON pr."lottery" = k."lottery" AND pr."draw_hour" = k."draw_hour"
        LEFT JOIN LATERAL (
          SELECT d."draw_minutes" FROM "draws" d
          WHERE d."tenant_id" = ${tenantId} AND d."name" = k."lottery" AND d."draw_minutes" / 60 = k."draw_hour"
          LIMIT 1
        ) d ON TRUE
        ORDER BY k."draw_hour", d."draw_minutes" NULLS LAST, k."lottery"`;

      const items = rows.map(toRow);
      return { from: query.from, to: query.to, rows: items, totals: sum(items) };
    });
  }
}
