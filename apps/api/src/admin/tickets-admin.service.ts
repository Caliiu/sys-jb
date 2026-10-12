import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminTicketDetail,
  type AdminTicketDetailItem,
  type AdminTicketDrawOption,
  type AdminTicketGame,
  type AdminTicketList,
  type AdminTicketListItem,
  type AdminTicketStatus,
  type FazendinhaModeId,
  fazendinhaGuess,
  findFazendinhaMode,
  findLotteryModality,
  findLotteryPlacement,
  formatGuess,
  type ItemPrize,
  minutesToTime,
  resultFullPrizes,
  settleFazendinhaBet,
  settleLotteryTicket,
  type TicketSettlement,
} from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { Errors } from '../common/app-error.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { ListTicketsQuery } from './admin.schemas.js';
import { outcomeOf } from './prizes-admin.service.js';

const DAY_MS = 86_400_000;

/**
 * Tabelas dos pules, uma por jogo (nomes fixos: nunca vêm da requisição). Só pule de Loterias pode ser cancelado e
 * guarda a tabela de cotação.
 */
const TICKET_TABLES: ReadonlyArray<{
  game: AdminTicketGame;
  table: Prisma.Sql;
  canceledAt: Prisma.Sql;
  quoteTable: Prisma.Sql;
}> = [
  {
    game: 'lotteries',
    table: Prisma.raw('"lottery_tickets"'),
    canceledAt: Prisma.raw('t."canceled_at"'),
    quoteTable: Prisma.raw('t."quote_table"'),
  },
  {
    game: 'fazendinha',
    table: Prisma.raw('"fazendinha_bets"'),
    canceledAt: Prisma.raw('NULL::timestamptz'),
    quoteTable: Prisma.raw('NULL::text'),
  },
];

/** Pules dos dois jogos da banca que passam no filtro (`where` usa o alias `t`), com as mesmas colunas. */
function ticketUnion(
  tenantId: string,
  where: Prisma.Sql,
  games: readonly AdminTicketGame[] = ['lotteries', 'fazendinha'],
) {
  return Prisma.join(
    TICKET_TABLES.filter(({ game }) => games.includes(game)).map(
      ({ game, table, canceledAt, quoteTable }) => Prisma.sql`
        SELECT ${game}::text AS game, t."id", t."pule_number", t."created_at", t."draw_date", t."draw_hour", t."lottery",
               t."draw_code", t."total_cents", t."user_id", ${canceledAt} AS canceled_at, ${quoteTable} AS quote_table
        FROM ${table} t
        WHERE t."tenant_id" = ${tenantId}::uuid ${where}`,
    ),
    ' UNION ALL ',
  );
}

/**
 * Linhas da lista sobre a união: apostador, prêmio pago e situação. CANCELED pelo cancelamento; WON com prêmio pago
 * (pule_prizes; ou apuração com prêmio); LOST apurado sem prêmio; PENDING ainda não apurado.
 */
const rowsOf = (tenantId: string, union: Prisma.Sql) => Prisma.sql`
  SELECT x.*, u."display_id", u."name",
         COALESCE(p."prize_cents", s."prize_cents", 0) AS prize_cents,
         CASE
           WHEN x.canceled_at IS NOT NULL THEN 'CANCELED'
           WHEN COALESCE(p."prize_cents", s."prize_cents", 0) > 0 THEN 'WON'
           WHEN s."id" IS NOT NULL OR p."id" IS NOT NULL THEN 'LOST'
           ELSE 'PENDING'
         END AS status
  FROM (${union}) x
  JOIN "users" u ON u."tenant_id" = ${tenantId}::uuid AND u."id" = x."user_id"
  LEFT JOIN "pule_prizes" p
    ON p."tenant_id" = ${tenantId}::uuid AND p."game" = x."game" AND p."pule_number" = x."pule_number"
  LEFT JOIN "pule_settlements" s
    ON s."tenant_id" = ${tenantId}::uuid AND s."game" = x."game" AND s."pule_number" = x."pule_number"`;

interface TicketRow {
  game: AdminTicketGame;
  id: string;
  pule_number: number;
  created_at: Date;
  draw_date: Date;
  draw_hour: number;
  lottery: string;
  draw_code: string;
  total_cents: bigint;
  user_id: string;
  display_id: number;
  name: string;
  canceled_at: Date | null;
  quote_table: string | null;
  prize_cents: bigint;
  status: AdminTicketStatus;
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
  canceledAt: row.canceled_at?.toISOString() ?? null,
  quoteTable: row.quote_table,
  prizeCents: Number(row.prize_cents),
  status: row.status,
});

/** Item premiado gravado na apuração (pule_prizes.items). */
const paidItemsOf = (items: Prisma.JsonValue | null): ItemPrize[] | null =>
  Array.isArray(items) ? (items as unknown as ItemPrize[]) : null;

/** Aposta do detalhe antes do prêmio e da situação. */
type ItemBase = Omit<AdminTicketDetailItem, 'prizeCents' | 'status'>;

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
      const union = ticketUnion(
        tenant.id,
        Prisma.sql`
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
      );

      const [totals] = await tx.$queryRaw<Array<{ total: bigint; total_cents: bigint | null }>>`
        SELECT count(*) AS total, sum(x."total_cents") FILTER (WHERE x.canceled_at IS NULL) AS total_cents
        FROM (${union}) x`;
      const total = Number(totals?.total ?? 0n);
      if (total === 0) return empty;

      const rows = await tx.$queryRaw<TicketRow[]>`
        SELECT * FROM (${rowsOf(tenant.id, union)}) x
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
      const union = ticketUnion(tenant.id, Prisma.sql`AND t."pule_number" = ${puleNumber}`);
      const rows = await tx.$queryRaw<TicketRow[]>`
        SELECT * FROM (${rowsOf(tenant.id, union)}) x ORDER BY x."game" DESC`;
      return rows.map(toItem);
    });
  }

  /**
   * Pule com as apostas: o prêmio pago por item (apurado) ou o que o resultado já dá (não apurado, pelas regras da
   * apuração), a apuração e o resultado. 404 se o pule não for da banca.
   */
  detail(tenant: ResolvedTenant, game: AdminTicketGame, puleNumber: number): Promise<AdminTicketDetail> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const union = ticketUnion(tenant.id, Prisma.sql`AND t."pule_number" = ${puleNumber}`, [game]);
      const [row] = await tx.$queryRaw<TicketRow[]>`SELECT * FROM (${rowsOf(tenant.id, union)}) x`;
      if (!row) throw Errors.ticketNotFound();
      const base = toItem(row);
      const where = { tenantId: tenant.id, game, puleNumber };

      const [settlement, prize, pule] = await Promise.all([
        tx.puleSettlement.findFirst({ where, include: { result: true } }),
        tx.pulePrize.findFirst({ where, select: { settledAt: true, items: true } }),
        puleOf(tx, tenant.id, game, row.id),
      ]);

      // Resultado: o da apuração; sem apuração, o ligado ao sorteio da venda (nome + hora), se já chegou.
      let result = settlement?.result ?? null;
      if (!result) {
        const draw = await tx.draw.findFirst({
          where: {
            tenantId: tenant.id,
            name: row.lottery,
            drawMinutes: { gte: row.draw_hour * 60, lt: (row.draw_hour + 1) * 60 },
          },
          select: { resultLottery: true, resultExtraction: true },
        });
        if (draw?.resultLottery && draw.resultExtraction !== null) {
          result = await tx.lotteryResult.findUnique({
            where: {
              drawDate_lottery_extraction: {
                drawDate: row.draw_date,
                lottery: draw.resultLottery,
                extraction: draw.resultExtraction,
              },
            },
          });
        }
      }
      const prizes = result
        ? resultFullPrizes({
            lottery: result.lottery,
            extraction: result.extraction,
            prizes: result.prizes,
            sum: result.sumValue,
            multiplication: result.multiplication,
          })
        : null;

      // Prêmio por item: o pago (apurado) ou o calculado sobre o resultado (só pule vendido antes de o resultado
      // chegar, como exige a apuração). Pule premiada antiga, sem os itens gravados: os itens ficam com a situação dele.
      let won: ItemPrize[] | null = null;
      let expectedPrizeCents = 0;
      if (base.status === 'WON' || base.status === 'LOST') {
        won = base.status === 'LOST' ? [] : paidItemsOf(prize?.items ?? null);
        expectedPrizeCents = base.prizeCents;
      } else if (base.status === 'PENDING' && result && prizes && row.created_at < result.receivedAt) {
        const outcome = outcomeOf(pule.settle(prizes));
        if (outcome) {
          won = outcome.items;
          expectedPrizeCents = outcome.prizeCents;
        }
      }

      const items = pule.items.map((item): AdminTicketDetailItem => {
        const hit = won?.find((w) =>
          game === 'fazendinha' ? w.guesses[0] === item.guesses[0] : w.position === item.position,
        );
        const settled = base.status === 'WON' || base.status === 'LOST';
        const status: AdminTicketStatus = settled && won !== null ? (hit ? 'WON' : 'LOST') : base.status;
        return { ...item, prizeCents: hit?.prizeCents ?? 0, status };
      });

      const corrected = settlement !== null && settlement.checkedPrizeCents !== settlement.prizeCents;
      return {
        ...base,
        drawHour: row.draw_hour,
        lotteryGame: pule.lotteryGame,
        settledAt: (settlement?.settledAt ?? prize?.settledAt)?.toISOString() ?? null,
        expectedPrizeCents,
        correctedPrizeCents: corrected ? Number(settlement.checkedPrizeCents) : null,
        result:
          result && prizes ? { prizes, revision: result.revision, receivedAt: result.receivedAt.toISOString() } : null,
        items,
      };
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

/** Apostas do pule (como no comprovante) e a conta da apuração sobre um resultado. */
async function puleOf(
  tx: TenantTx,
  tenantId: string,
  game: AdminTicketGame,
  id: string,
): Promise<{ lotteryGame: string | null; items: ItemBase[]; settle: (prizes: string[]) => () => TicketSettlement }> {
  if (game === 'lotteries') {
    const ticket = await tx.lotteryTicket.findFirstOrThrow({
      where: { tenantId, id },
      select: { game: true, items: { orderBy: { position: 'asc' } } },
    });
    return {
      lotteryGame: ticket.game,
      items: ticket.items.map((item) => {
        const modality = findLotteryModality(item.modality);
        return {
          position: item.position,
          modality: item.modality,
          modalityLabel: modality?.label ?? item.modality.toUpperCase(),
          guesses: item.guesses.map((guess) => (modality ? formatGuess(modality, guess) : guess)),
          placement: item.placement,
          placementLabel: findLotteryPlacement(item.placement)?.label ?? item.placement,
          stakeCents: Number(item.totalCents),
          quoteCents: item.quoteCents,
          possiblePrizeCents: Number(item.possiblePrizeCents),
        };
      }),
      settle: (prizes) => () =>
        settleLotteryTicket(
          ticket.items.map((item) => ({
            position: item.position,
            modality: item.modality,
            placement: item.placement,
            guesses: item.guesses,
            amountCents: Number(item.amountCents),
            split: item.split === 'each' ? 'each' : 'total',
            quoteCents: item.quoteCents,
            centenaQuoteCents: item.centenaQuoteCents,
          })),
          prizes,
        ),
    };
  }

  const bet = await tx.fazendinhaBet.findFirstOrThrow({
    where: { tenantId, id },
    select: { mode: true, stakeCents: true, prizeCents: true, numbers: { select: { number: true } } },
  });
  const mode = bet.mode.toLowerCase() as FazendinhaModeId;
  const numbers = bet.numbers.map((n) => n.number).sort((a, b) => a - b);
  // Fazendinha: só a cabeça (1º prêmio) vale.
  const placementLabel = findLotteryPlacement('p1')?.label ?? 'p1';
  return {
    lotteryGame: null,
    items: numbers.map((number, index) => ({
      position: index + 1,
      modality: mode,
      modalityLabel: findFazendinhaMode(mode)?.label ?? mode.toUpperCase(),
      guesses: [fazendinhaGuess(mode, number)],
      placement: 'p1',
      placementLabel,
      stakeCents: bet.stakeCents,
      quoteCents: null,
      possiblePrizeCents: bet.prizeCents,
    })),
    settle: (prizes) => () => settleFazendinhaBet({ mode, numbers, prizeCents: bet.prizeCents }, prizes),
  };
}
