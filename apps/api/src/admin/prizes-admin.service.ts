import { Inject, Injectable } from '@nestjs/common';
import type { AdminPrizeList, AdminPrizeListItem, AdminTicketGame } from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { ListPrizesQuery } from './admin.schemas.js';

interface PrizeRow {
  game: AdminTicketGame;
  pule_number: number;
  draw_date: Date;
  lottery: string;
  draw_code: string;
  stake_cents: bigint;
  prize_cents: bigint;
  settled_at: Date;
  user_id: string;
  display_id: number;
  name: string;
}

const toItem = (row: PrizeRow): AdminPrizeListItem => ({
  game: row.game,
  puleNumber: row.pule_number,
  drawDate: row.draw_date.toISOString().slice(0, 10),
  lottery: row.lottery,
  drawCode: row.draw_code,
  stakeCents: Number(row.stake_cents),
  prizeCents: Number(row.prize_cents),
  settledAt: row.settled_at.toISOString(),
  player: { id: row.user_id, displayId: row.display_id, name: row.name },
});

/**
 * Pules premiadas vistas pelo operador (registros da apuração de prêmios). Só leitura. Toda consulta filtra pela banca
 * do operador, além do RLS da transação; o SQL é sempre parametrizado.
 */
@Injectable()
export class PrizesAdminService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /** Pules premiadas no período (data do jogo), maiores prêmios primeiro, com o total de prêmios do filtro. */
  list(tenant: ResolvedTenant, query: ListPrizesQuery): Promise<AdminPrizeList> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const empty: AdminPrizeList = {
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        totalPages: 1,
        totalPrizeCents: 0,
      };

      // Sorteio pelo nome e hora da venda (o banco não deixa trocá-los depois de vender; o código pode mudar).
      let draw: { name: string; hour: number } | null = null;
      if (query.drawId) {
        const row = await tx.draw.findFirst({
          where: { tenantId: tenant.id, id: query.drawId },
          select: { name: true, drawMinutes: true },
        });
        if (!row) return empty;
        draw = { name: row.name, hour: Math.floor(row.drawMinutes / 60) };
      }

      const where = Prisma.sql`
        p."tenant_id" = ${tenant.id}::uuid
        AND p."draw_date" BETWEEN ${query.from}::date AND ${query.to}::date
        ${query.userId ? Prisma.sql`AND p."user_id" = ${query.userId}::uuid` : Prisma.empty}
        ${draw ? Prisma.sql`AND p."lottery" = ${draw.name} AND p."draw_hour" = ${draw.hour}` : Prisma.empty}
        ${query.minPrizeCents !== undefined ? Prisma.sql`AND p."prize_cents" >= ${query.minPrizeCents}` : Prisma.empty}
        ${query.maxPrizeCents !== undefined ? Prisma.sql`AND p."prize_cents" <= ${query.maxPrizeCents}` : Prisma.empty}
        ${
          query.promoterId
            ? Prisma.sql`AND EXISTS (
                SELECT 1 FROM "users" u
                JOIN "users" r ON r."tenant_id" = u."tenant_id" AND r."id" = u."referred_by_user_id"
                WHERE u."tenant_id" = p."tenant_id" AND u."id" = p."user_id"
                  AND r."id" = ${query.promoterId}::uuid AND r."promoter_commission_bps" IS NOT NULL)`
            : Prisma.empty
        }`;

      const [totals] = await tx.$queryRaw<Array<{ total: bigint; prize_cents: bigint | null }>>`
        SELECT count(*) AS total, sum(p."prize_cents") AS prize_cents FROM "pule_prizes" p WHERE ${where}`;
      const total = Number(totals?.total ?? 0n);
      if (total === 0) return empty;

      const rows = await tx.$queryRaw<PrizeRow[]>`
        SELECT p."game", p."pule_number", p."draw_date", p."lottery", p."draw_code", p."stake_cents", p."prize_cents",
               p."settled_at", p."user_id", u."display_id", u."name"
        FROM "pule_prizes" p
        JOIN "users" u ON u."tenant_id" = p."tenant_id" AND u."id" = p."user_id"
        WHERE ${where}
        ORDER BY p."prize_cents" DESC, p."draw_date" DESC, p."game", p."pule_number" DESC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;

      return {
        items: rows.map(toItem),
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        totalPrizeCents: Number(totals?.prize_cents ?? 0n),
      };
    });
  }
}
