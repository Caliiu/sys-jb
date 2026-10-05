import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_PRIZE_REVIEWS_LIMIT,
  type AdminPrizeList,
  type AdminPrizeListItem,
  type AdminPrizeReview,
  type AdminTicketGame,
} from '@sysjb/contracts';
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

interface ReviewRow {
  game: AdminTicketGame;
  pule_number: number;
  draw_date: Date;
  lottery: string;
  draw_code: string;
  prize_cents: bigint;
  checked_prize_cents: bigint;
  settled_at: Date;
  checked_at: Date;
  user_id: string;
  display_id: number;
  name: string;
}

const player = (row: { user_id: string; display_id: number; name: string }) => ({
  id: row.user_id,
  displayId: row.display_id,
  name: row.name,
});

const toItem = (row: PrizeRow): AdminPrizeListItem => ({
  game: row.game,
  puleNumber: row.pule_number,
  drawDate: row.draw_date.toISOString().slice(0, 10),
  lottery: row.lottery,
  drawCode: row.draw_code,
  stakeCents: Number(row.stake_cents),
  prizeCents: Number(row.prize_cents),
  settledAt: row.settled_at.toISOString(),
  player: player(row),
});

const toReview = (row: ReviewRow): AdminPrizeReview => ({
  game: row.game,
  puleNumber: row.pule_number,
  drawDate: row.draw_date.toISOString().slice(0, 10),
  lottery: row.lottery,
  drawCode: row.draw_code,
  paidCents: Number(row.prize_cents),
  correctedCents: Number(row.checked_prize_cents),
  settledAt: row.settled_at.toISOString(),
  checkedAt: row.checked_at.toISOString(),
  player: player(row),
});

/** Colunas de uma consulta onde ficam o jogador e o sorteio da venda (nome + hora) de cada pule. */
interface PuleColumns {
  user: Prisma.Sql;
  lottery: Prisma.Sql;
  hour: Prisma.Sql;
}

/**
 * Pules premiadas vistas pelo operador (registros da apuração de prêmios), com os avisos de resultado corrigido depois
 * do pagamento e a contagem de pules ainda não apurados. Só leitura. Toda consulta filtra pela banca do operador, além
 * do RLS da transação; o SQL é sempre parametrizado.
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
        reviews: [],
        reviewsTotal: 0,
        pendingCount: 0,
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

      // Jogador, sorteio e promotor: valem para a lista, os avisos e os pendentes.
      const filters = (c: PuleColumns) => Prisma.sql`
        ${query.userId ? Prisma.sql`AND ${c.user} = ${query.userId}::uuid` : Prisma.empty}
        ${draw ? Prisma.sql`AND ${c.lottery} = ${draw.name} AND ${c.hour} = ${draw.hour}` : Prisma.empty}
        ${
          query.promoterId
            ? Prisma.sql`AND EXISTS (
                SELECT 1 FROM "users" u
                JOIN "users" r ON r."tenant_id" = u."tenant_id" AND r."id" = u."referred_by_user_id"
                WHERE u."tenant_id" = ${tenant.id}::uuid AND u."id" = ${c.user}
                  AND r."id" = ${query.promoterId}::uuid AND r."promoter_commission_bps" IS NOT NULL)`
            : Prisma.empty
        }`;
      const period = (column: Prisma.Sql) => Prisma.sql`${column} BETWEEN ${query.from}::date AND ${query.to}::date`;

      const where = Prisma.sql`
        p."tenant_id" = ${tenant.id}::uuid
        AND ${period(Prisma.sql`p."draw_date"`)}
        ${filters({ user: Prisma.sql`p."user_id"`, lottery: Prisma.sql`p."lottery"`, hour: Prisma.sql`p."draw_hour"` })}
        ${query.minPrizeCents !== undefined ? Prisma.sql`AND p."prize_cents" >= ${query.minPrizeCents}` : Prisma.empty}
        ${query.maxPrizeCents !== undefined ? Prisma.sql`AND p."prize_cents" <= ${query.maxPrizeCents}` : Prisma.empty}`;

      const reviewWhere = Prisma.sql`
        s."tenant_id" = ${tenant.id}::uuid
        AND ${period(Prisma.sql`s."draw_date"`)}
        AND s."checked_prize_cents" <> s."prize_cents"
        ${filters({
          user: Prisma.sql`s."user_id"`,
          lottery: Prisma.sql`COALESCE(t."lottery", b."lottery")`,
          hour: Prisma.sql`COALESCE(t."draw_hour", b."draw_hour")`,
        })}`;
      const reviewJoins = Prisma.sql`
        LEFT JOIN "lottery_tickets" t ON t."tenant_id" = s."tenant_id" AND t."id" = s."lottery_ticket_id"
        LEFT JOIN "fazendinha_bets" b ON b."tenant_id" = s."tenant_id" AND b."id" = s."fazendinha_bet_id"`;

      const [[totals], [reviewCount], [pending], reviews] = await Promise.all([
        tx.$queryRaw<Array<{ total: bigint; prize_cents: bigint | null }>>`
          SELECT count(*) AS total, sum(p."prize_cents") AS prize_cents FROM "pule_prizes" p WHERE ${where}`,
        tx.$queryRaw<Array<{ total: bigint }>>`
          SELECT count(*) AS total FROM "pule_settlements" s ${reviewJoins} WHERE ${reviewWhere}`,
        // Pules não cancelados do período cujo sorteio (horário do cadastro) já passou e que ainda não foram apurados.
        tx.$queryRaw<Array<{ total: bigint }>>`
          WITH pules AS (
            SELECT t."id" AS ticket_id, NULL::uuid AS bet_id, t."user_id", t."lottery", t."draw_hour", t."draw_date"
            FROM "lottery_tickets" t
            WHERE t."tenant_id" = ${tenant.id}::uuid AND t."canceled_at" IS NULL AND ${period(Prisma.sql`t."draw_date"`)}
            UNION ALL
            SELECT NULL::uuid, b."id", b."user_id", b."lottery", b."draw_hour", b."draw_date"
            FROM "fazendinha_bets" b
            WHERE b."tenant_id" = ${tenant.id}::uuid AND ${period(Prisma.sql`b."draw_date"`)}
          )
          SELECT count(*) AS total
          FROM pules x
          LEFT JOIN "draws" d
            ON d."tenant_id" = ${tenant.id}::uuid AND d."name" = x."lottery" AND d."draw_minutes" / 60 = x."draw_hour"
          WHERE ((x."draw_date" + make_interval(mins => COALESCE(d."draw_minutes", x."draw_hour" * 60)))
                   AT TIME ZONE 'America/Sao_Paulo') < now()
            AND (x.ticket_id IS NULL OR NOT EXISTS (
                  SELECT 1 FROM "pule_settlements" s
                  WHERE s."tenant_id" = ${tenant.id}::uuid AND s."lottery_ticket_id" = x.ticket_id))
            AND (x.bet_id IS NULL OR NOT EXISTS (
                  SELECT 1 FROM "pule_settlements" s
                  WHERE s."tenant_id" = ${tenant.id}::uuid AND s."fazendinha_bet_id" = x.bet_id))
            ${filters({ user: Prisma.sql`x."user_id"`, lottery: Prisma.sql`x."lottery"`, hour: Prisma.sql`x."draw_hour"` })}`,
        tx.$queryRaw<ReviewRow[]>`
          SELECT s."game", s."pule_number", s."draw_date", s."prize_cents", s."checked_prize_cents", s."settled_at",
                 s."checked_at", s."user_id", u."display_id", u."name",
                 COALESCE(t."lottery", b."lottery") AS lottery, COALESCE(t."draw_code", b."draw_code") AS draw_code
          FROM "pule_settlements" s
          JOIN "users" u ON u."tenant_id" = s."tenant_id" AND u."id" = s."user_id"
          ${reviewJoins}
          WHERE ${reviewWhere}
          ORDER BY s."checked_at" DESC, s."game", s."pule_number" DESC
          LIMIT ${ADMIN_PRIZE_REVIEWS_LIMIT}`,
      ]);

      const total = Number(totals?.total ?? 0n);
      const extras = {
        reviews: reviews.map(toReview),
        reviewsTotal: Number(reviewCount?.total ?? 0n),
        pendingCount: Number(pending?.total ?? 0n),
      };
      if (total === 0) return { ...empty, ...extras };

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
        ...extras,
      };
    });
  }
}
