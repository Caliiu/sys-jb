import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_PRIZE_REVIEWS_LIMIT,
  type AdminPrizeList,
  type AdminPrizeListItem,
  type AdminPrizeReview,
  type AdminPrizeStatus,
  type AdminTicketGame,
  type FazendinhaModeId,
  findFazendinhaMode,
  findLotteryModality,
  findLotteryPlacement,
  formatGuess,
  GIFT_MILHAR_LABEL,
  resultFullPrizes,
  SettlementRuleError,
  settleFazendinhaBet,
  settleLotteryTicket,
  type TicketSettlement,
} from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { ListPrizesQuery } from './admin.schemas.js';

/** Aposta premiada (paga ou aguardando apuração), como sai da consulta da lista. */
interface PrizeRow {
  id: string;
  status: AdminPrizeStatus;
  game: AdminTicketGame;
  pule_number: number;
  draw_date: Date;
  lottery: string;
  draw_code: string;
  modality: string | null;
  placement: string | null;
  /** Palpites premiados do item (null em pule premiada antiga, sem itens). */
  guesses: string[] | null;
  stake_cents: bigint;
  prize_cents: bigint;
  settled_at: Date | null;
  user_id: string;
  display_id: number;
  name: string;
  is_gift: boolean;
}

/** Aposta premiada ainda não apurada, calculada aqui; vai para a consulta como JSON (jsonb_to_recordset). */
interface PendingBet {
  id: string;
  game: AdminTicketGame;
  pule_number: number;
  draw_date: string;
  lottery: string;
  draw_code: string;
  modality: string;
  placement: string;
  guesses: string[];
  stake_cents: number;
  prize_cents: number;
  user_id: string;
  position: number;
  is_gift: boolean;
}

/** Pule não apurado cujo sorteio já tem resultado, com o resultado (como na apuração). */
interface PendingPule {
  id: string;
  pule_number: number;
  draw_date: Date;
  lottery: string;
  draw_code: string;
  user_id: string;
  result_lottery: string;
  extraction: number;
  prizes: string[];
  sum_value: string | null;
  multiplication: string | null;
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

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

/** Rótulo da modalidade como no app (Loterias ou Fazendinha). */
function modalityLabel(game: AdminTicketGame, modality: string): string {
  const label = game === 'fazendinha' ? findFazendinhaMode(modality)?.label : findLotteryModality(modality)?.label;
  return label ?? modality.toUpperCase();
}

/** Palpites como no comprovante (combos com hífen), separados por vírgula. */
function guessText(game: AdminTicketGame, modality: string | null, guesses: string[]): string {
  const lottery = game === 'lotteries' && modality ? findLotteryModality(modality) : undefined;
  return guesses.map((guess) => (lottery ? formatGuess(lottery, guess) : guess)).join(', ');
}

const toItem = (row: PrizeRow): AdminPrizeListItem => ({
  id: row.id,
  status: row.status,
  game: row.game,
  puleNumber: row.pule_number,
  drawDate: dateOnly(row.draw_date),
  lottery: row.lottery,
  drawCode: row.draw_code,
  modality: row.modality,
  modalityLabel: row.modality === null ? null : row.is_gift ? GIFT_MILHAR_LABEL : modalityLabel(row.game, row.modality),
  guess: row.guesses === null ? null : guessText(row.game, row.modality, row.guesses),
  placement: row.placement,
  placementLabel: row.placement === null ? null : (findLotteryPlacement(row.placement)?.label ?? row.placement),
  stakeCents: Number(row.stake_cents),
  isGift: row.is_gift,
  prizeCents: Number(row.prize_cents),
  settledAt: row.settled_at?.toISOString() ?? null,
  player: player(row),
});

const fullPrizes = (r: PendingPule) =>
  resultFullPrizes({
    lottery: r.result_lottery,
    extraction: r.extraction,
    prizes: r.prizes,
    sum: r.sum_value,
    multiplication: r.multiplication,
  });

/**
 * Conta da apuração (regras de @sysjb/contracts) sobre o resultado atual. null = não dá para calcular ainda (falta uma
 * posição do resultado, modalidade sem regra): a pule fica só na contagem de pendentes.
 */
export function outcomeOf(compute: () => TicketSettlement): Extract<TicketSettlement, { status: 'settled' }> | null {
  try {
    const outcome = compute();
    return outcome.status === 'settled' ? outcome : null;
  } catch (error) {
    if (error instanceof SettlementRuleError) return null;
    throw error;
  }
}

const toReview = (row: ReviewRow): AdminPrizeReview => ({
  game: row.game,
  puleNumber: row.pule_number,
  drawDate: dateOnly(row.draw_date),
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
 * Apostas premiadas vistas pelo operador: as pagas (registros da apuração de prêmios, uma linha por item premiado do
 * pule) e as que aguardam apuração (resultado já chegou, calculadas aqui com as regras da apuração), com os avisos de
 * resultado corrigido depois do pagamento e a contagem de pules ainda não apurados. Só leitura. Toda consulta filtra
 * pela banca do operador, além do RLS da transação; o SQL é sempre parametrizado.
 */
@Injectable()
export class PrizesAdminService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /**
   * Apostas premiadas no período (data do jogo), maiores prêmios primeiro (depois a data mais recente), com o total de
   * prêmios do filtro. A faixa de prêmio vale para o prêmio de cada aposta.
   */
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

      const [[reviewCount], [pending], reviews, pendingBets] = await Promise.all([
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
        query.status === 'paid' ? Promise.resolve([]) : pendingBetsOf(tx, tenant.id, filters, period),
      ]);

      const extras = {
        reviews: reviews.map(toReview),
        reviewsTotal: Number(reviewCount?.total ?? 0n),
        pendingCount: Number(pending?.total ?? 0n),
      };

      // Pagas: uma linha por item premiado gravado na apuração (pule_prizes.items), achado pela posição no pule
      // apurado. Pule premiada antiga, sem itens: uma linha para a pule inteira, sem modalidade.
      const paid = Prisma.sql`
        SELECT COALESCE(i."id", b."id", p."id")::text AS id, 'PAID' AS status, p."game", p."pule_number", p."draw_date",
               p."lottery", p."draw_code",
               COALESCE(i."modality", lower(b."mode"::text)) AS modality,
               COALESCE(i."placement", CASE WHEN b."id" IS NOT NULL THEN 'p1' END) AS placement,
               e.value -> 'guesses' AS guesses,
               COALESCE(CASE WHEN i."is_gift" THEN i."amount_cents" ELSE i."total_cents" END, b."stake_cents"::bigint,
                        p."stake_cents") AS stake_cents,
               COALESCE((e.value ->> 'prizeCents')::bigint, p."prize_cents") AS prize_cents,
               p."settled_at", p."user_id", COALESCE((e.value ->> 'position')::integer, 0) AS position,
               COALESCE(i."is_gift", false) AS is_gift
        FROM "pule_prizes" p
        LEFT JOIN "pule_settlements" s
          ON s."tenant_id" = p."tenant_id" AND s."game" = p."game" AND s."pule_number" = p."pule_number"
        LEFT JOIN LATERAL jsonb_array_elements(p."items") e ON true
        LEFT JOIN "lottery_ticket_items" i
          ON i."tenant_id" = p."tenant_id" AND i."ticket_id" = s."lottery_ticket_id"
         AND i."position" = (e.value ->> 'position')::smallint
        LEFT JOIN "fazendinha_bets" b ON b."tenant_id" = p."tenant_id" AND b."id" = s."fazendinha_bet_id"
        WHERE p."tenant_id" = ${tenant.id}::uuid
          AND ${period(Prisma.sql`p."draw_date"`)}
          ${query.status === 'pending' ? Prisma.sql`AND false` : Prisma.empty}
          ${filters({ user: Prisma.sql`p."user_id"`, lottery: Prisma.sql`p."lottery"`, hour: Prisma.sql`p."draw_hour"` })}`;
      const waiting = Prisma.sql`
        SELECT x."id", 'PENDING' AS status, x."game", x."pule_number", x."draw_date", x."lottery", x."draw_code",
               x."modality", x."placement", x."guesses", x."stake_cents", x."prize_cents", NULL::timestamptz AS settled_at,
               x."user_id", x."position", x."is_gift"
        FROM jsonb_to_recordset(${JSON.stringify(pendingBets)}::jsonb) AS x(
          "id" text, "game" text, "pule_number" integer, "draw_date" date, "lottery" text, "draw_code" text,
          "modality" text, "placement" text, "guesses" jsonb, "stake_cents" bigint, "prize_cents" bigint,
          "user_id" uuid, "position" integer, "is_gift" boolean)`;
      const rows = Prisma.sql`
        SELECT * FROM (${paid} UNION ALL ${waiting}) bets
        WHERE true
          ${query.minPrizeCents !== undefined ? Prisma.sql`AND "prize_cents" >= ${query.minPrizeCents}` : Prisma.empty}
          ${query.maxPrizeCents !== undefined ? Prisma.sql`AND "prize_cents" <= ${query.maxPrizeCents}` : Prisma.empty}`;

      const [totals] = await tx.$queryRaw<Array<{ total: bigint; prize_cents: bigint | null }>>`
        SELECT count(*) AS total, sum(r."prize_cents") AS prize_cents FROM (${rows}) r`;
      const total = Number(totals?.total ?? 0n);
      if (total === 0) return { ...empty, ...extras };

      const page = await tx.$queryRaw<PrizeRow[]>`
        SELECT r."id", r."status", r."game", r."pule_number", r."draw_date", r."lottery", r."draw_code", r."modality",
               r."placement", r."guesses", r."stake_cents", r."prize_cents", r."settled_at", r."user_id",
               r."is_gift", u."display_id", u."name"
        FROM (${rows}) r
        JOIN "users" u ON u."tenant_id" = ${tenant.id}::uuid AND u."id" = r."user_id"
        ORDER BY r."prize_cents" DESC, r."draw_date" DESC, r."game", r."pule_number" DESC, r."position", r."id"
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;

      return {
        items: page.map(toItem),
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

/**
 * Apostas que vão ganhar na apuração e ainda não foram pagas: pules não apurados do período cujo sorteio já tem o
 * resultado ligado (na carência, ou deixados de lado pela apuração), conferidos com as mesmas regras e o mesmo resultado
 * da apuração. O que ainda não dá para calcular (falta uma posição, sem regra) fica de fora, só na contagem de
 * pendentes; pule vendido depois de o resultado chegar também (a apuração recusa).
 */
async function pendingBetsOf(
  tx: TenantTx,
  tenantId: string,
  filters: (c: PuleColumns) => Prisma.Sql,
  period: (column: Prisma.Sql) => Prisma.Sql,
): Promise<PendingBet[]> {
  const resultColumns = Prisma.sql`r."lottery" AS result_lottery, r."extraction", r."prizes", r."sum_value",
    r."multiplication"`;
  const [tickets, bets] = await Promise.all([
    tx.$queryRaw<PendingPule[]>`
      SELECT t."id", t."pule_number", t."draw_date", t."lottery", t."draw_code", t."user_id", ${resultColumns}
      FROM "lottery_tickets" t
      JOIN "draws" d ON d."tenant_id" = t."tenant_id" AND d."name" = t."lottery" AND d."draw_minutes" / 60 = t."draw_hour"
      JOIN "lottery_results" r
        ON r."draw_date" = t."draw_date" AND r."lottery" = d."result_lottery" AND r."extraction" = d."result_extraction"
      WHERE t."tenant_id" = ${tenantId}::uuid AND t."canceled_at" IS NULL AND ${period(Prisma.sql`t."draw_date"`)}
        AND t."created_at" < r."received_at"
        AND NOT EXISTS (
          SELECT 1 FROM "pule_settlements" s WHERE s."tenant_id" = t."tenant_id" AND s."lottery_ticket_id" = t."id")
        ${filters({ user: Prisma.sql`t."user_id"`, lottery: Prisma.sql`t."lottery"`, hour: Prisma.sql`t."draw_hour"` })}`,
    tx.$queryRaw<PendingPule[]>`
      SELECT b."id", b."pule_number", b."draw_date", b."lottery", b."draw_code", b."user_id", ${resultColumns}
      FROM "fazendinha_bets" b
      JOIN "draws" d ON d."tenant_id" = b."tenant_id" AND d."name" = b."lottery" AND d."draw_minutes" / 60 = b."draw_hour"
      JOIN "lottery_results" r
        ON r."draw_date" = b."draw_date" AND r."lottery" = d."result_lottery" AND r."extraction" = d."result_extraction"
      WHERE b."tenant_id" = ${tenantId}::uuid AND ${period(Prisma.sql`b."draw_date"`)}
        AND b."created_at" < r."received_at"
        AND NOT EXISTS (
          SELECT 1 FROM "pule_settlements" s WHERE s."tenant_id" = b."tenant_id" AND s."fazendinha_bet_id" = b."id")
        ${filters({ user: Prisma.sql`b."user_id"`, lottery: Prisma.sql`b."lottery"`, hour: Prisma.sql`b."draw_hour"` })}`,
  ]);

  const [items, betRows] = await Promise.all([
    tickets.length === 0
      ? []
      : tx.lotteryTicketItem.findMany({
          where: { tenantId, ticketId: { in: tickets.map((t) => t.id) } },
          orderBy: { position: 'asc' },
        }),
    bets.length === 0
      ? []
      : tx.fazendinhaBet.findMany({
          where: { tenantId, id: { in: bets.map((b) => b.id) } },
          select: { id: true, mode: true, stakeCents: true, prizeCents: true, numbers: { select: { number: true } } },
        }),
  ]);
  const itemsOf = new Map<string, typeof items>();
  for (const item of items) itemsOf.set(item.ticketId, [...(itemsOf.get(item.ticketId) ?? []), item]);
  const betOf = new Map(betRows.map((bet) => [bet.id, bet]));

  const puleOf = (row: PendingPule, game: AdminTicketGame) => ({
    game,
    pule_number: row.pule_number,
    draw_date: dateOnly(row.draw_date),
    lottery: row.lottery,
    draw_code: row.draw_code,
    user_id: row.user_id,
  });
  const won: PendingBet[] = [];
  for (const ticket of tickets) {
    const ticketItems = itemsOf.get(ticket.id) ?? [];
    const outcome = outcomeOf(() =>
      settleLotteryTicket(
        ticketItems.map((item) => ({
          position: item.position,
          modality: item.modality,
          placement: item.placement,
          guesses: item.guesses,
          amountCents: Number(item.amountCents),
          split: item.split === 'each' ? 'each' : 'total',
          quoteCents: item.quoteCents,
          centenaQuoteCents: item.centenaQuoteCents,
        })),
        fullPrizes(ticket),
      ),
    );
    for (const prize of outcome?.items ?? []) {
      const item = ticketItems.find((i) => i.position === prize.position)!;
      won.push({
        ...puleOf(ticket, 'lotteries'),
        id: item.id,
        modality: item.modality,
        placement: item.placement,
        guesses: prize.guesses,
        stake_cents: Number(item.isGift ? item.amountCents : item.totalCents),
        prize_cents: prize.prizeCents,
        position: prize.position,
        is_gift: item.isGift,
      });
    }
  }
  for (const row of bets) {
    const bet = betOf.get(row.id);
    if (!bet) continue;
    const mode = bet.mode.toLowerCase() as FazendinhaModeId;
    const outcome = outcomeOf(() =>
      settleFazendinhaBet(
        { mode, numbers: bet.numbers.map((n) => n.number), prizeCents: bet.prizeCents },
        fullPrizes(row),
      ),
    );
    const prize = outcome?.items[0];
    if (!prize) continue;
    // Fazendinha: só a cabeça (1º prêmio) vale e no máximo um número ganha.
    won.push({
      ...puleOf(row, 'fazendinha'),
      id: bet.id,
      modality: mode,
      placement: 'p1',
      guesses: prize.guesses,
      stake_cents: bet.stakeCents,
      prize_cents: prize.prizeCents,
      position: 1,
      is_gift: false,
    });
  }
  return won;
}
