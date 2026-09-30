import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminTicketDrawOption,
  type AdminTicketGame,
  type AdminTicketList,
  type AdminTicketListItem,
  minutesToTime,
} from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { ListTicketsQuery } from './admin.schemas.js';

const DAY_MS = 86_400_000;

/** Tabelas dos pules, uma por jogo (nomes fixos: nunca vêm da requisição). */
const TICKET_TABLES: ReadonlyArray<{ game: AdminTicketGame; table: Prisma.Sql }> = [
  { game: 'lotteries', table: Prisma.raw('"lottery_tickets"') },
  { game: 'fazendinha', table: Prisma.raw('"fazendinha_bets"') },
];

interface TicketRow {
  game: AdminTicketGame;
  pule_number: number;
  created_at: Date;
  draw_date: Date;
  lottery: string;
  draw_code: string;
  total_cents: bigint;
  user_id: string;
  display_id: number;
  name: string;
}

const toItem = (row: TicketRow): AdminTicketListItem => ({
  game: row.game,
  puleNumber: row.pule_number,
  createdAt: row.created_at.toISOString(),
  drawDate: row.draw_date.toISOString().slice(0, 10),
  lottery: row.lottery,
  drawCode: row.draw_code,
  totalCents: Number(row.total_cents),
  player: { id: row.user_id, displayId: row.display_id, name: row.name },
});

/**
 * Bilhetes (pules) vistos pelo operador: Loterias e Fazendinha juntos. Só leitura. Toda consulta filtra pela banca
 * do operador, além do RLS da transação; o SQL é sempre parametrizado.
 */
@Injectable()
export class TicketsAdminService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /** Bilhetes vendidos no dia (Brasília), mais recentes primeiro, com o total e a soma de todo o filtro. */
  list(tenant: ResolvedTenant, query: ListTicketsQuery): Promise<AdminTicketList> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const empty = { items: [], page: query.page, pageSize: query.pageSize, total: 0, totalPages: 1, totalCents: 0 };

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

      // Dia da venda em Brasília (sempre -03:00, sem horário de verão).
      const start = new Date(`${query.date}T00:00:00-03:00`);
      const end = new Date(start.getTime() + DAY_MS);
      const union = Prisma.join(
        TICKET_TABLES.map(
          ({ game, table }) => Prisma.sql`
            SELECT ${game}::text AS game, t."pule_number", t."created_at", t."draw_date", t."lottery", t."draw_code",
                   t."total_cents", t."user_id"
            FROM ${table} t
            WHERE t."tenant_id" = ${tenant.id}::uuid
              AND t."created_at" >= ${start} AND t."created_at" < ${end}
              ${query.userId ? Prisma.sql`AND t."user_id" = ${query.userId}::uuid` : Prisma.empty}
              ${draw ? Prisma.sql`AND t."lottery" = ${draw.name} AND t."draw_hour" = ${draw.hour}` : Prisma.empty}
              ${
                query.promoterId
                  ? Prisma.sql`AND EXISTS (
                      SELECT 1 FROM "users" u
                      JOIN "users" p ON p."tenant_id" = u."tenant_id" AND p."id" = u."referred_by_user_id"
                      WHERE u."tenant_id" = t."tenant_id" AND u."id" = t."user_id"
                        AND p."id" = ${query.promoterId}::uuid AND p."promoter_commission_bps" IS NOT NULL)`
                  : Prisma.empty
              }`,
        ),
        ' UNION ALL ',
      );

      const [totals] = await tx.$queryRaw<Array<{ total: bigint; total_cents: bigint | null }>>`
        SELECT count(*) AS total, sum(x."total_cents") AS total_cents FROM (${union}) x`;
      const total = Number(totals?.total ?? 0n);
      if (total === 0) return empty;

      const rows = await tx.$queryRaw<TicketRow[]>`
        SELECT x.*, u."display_id", u."name"
        FROM (${union}) x
        JOIN "users" u ON u."tenant_id" = ${tenant.id}::uuid AND u."id" = x."user_id"
        ORDER BY x."created_at" DESC, x."game", x."pule_number" DESC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;

      return {
        items: rows.map(toItem),
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        totalCents: Number(totals?.total_cents ?? 0n),
      };
    });
  }

  /** Bilhete pelo número: um por jogo (cada um tem a sua numeração), Loterias primeiro. */
  search(tenant: ResolvedTenant, puleNumber: number): Promise<AdminTicketListItem[]> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const where = { tenantId: tenant.id, puleNumber };
      const select = {
        puleNumber: true,
        createdAt: true,
        drawDate: true,
        lottery: true,
        drawCode: true,
        totalCents: true,
        user: { select: { id: true, displayId: true, name: true } },
      } as const;
      const [ticket, bet] = await Promise.all([
        tx.lotteryTicket.findFirst({ where, select }),
        tx.fazendinhaBet.findFirst({ where, select }),
      ]);
      const found: Array<[AdminTicketGame, typeof ticket]> = [
        ['lotteries', ticket],
        ['fazendinha', bet],
      ];
      return found.flatMap(([game, row]) =>
        row
          ? [
              {
                game,
                puleNumber: row.puleNumber,
                createdAt: row.createdAt.toISOString(),
                drawDate: row.drawDate.toISOString().slice(0, 10),
                lottery: row.lottery,
                drawCode: row.drawCode,
                totalCents: Number(row.totalCents),
                player: row.user,
              },
            ]
          : [],
      );
    });
  }

  /** Sorteios da banca (ativos ou não: bilhetes antigos continuam consultáveis), por horário. */
  drawOptions(tenant: ResolvedTenant): Promise<AdminTicketDrawOption[]> {
    return this.db.withTenant(tenant.id, async (tx: TenantTx) => {
      const draws = await tx.draw.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, name: true, drawMinutes: true },
        orderBy: [{ drawMinutes: 'asc' }, { name: 'asc' }],
      });
      return draws.map((d) => ({ id: d.id, name: d.name, drawTime: minutesToTime(d.drawMinutes) }));
    });
  }
}
