import { Inject, Injectable } from '@nestjs/common';
import {
  type PlaceLotteryTicketsResponse,
  type PublicDraw,
  type PublicLotteryTicket,
  type PublicQuotes,
  dayOffsetOf,
  findLotteryModality,
  findLotteryPlacement,
  isDrawOpenAt,
  isValidLotteryGuess,
  lotteryItemTotalCents,
  lotteryPossiblePrizeCents,
  lotteryQuoteCents,
  placementsFor,
} from '@sysjb/contracts';
import type { LotteryTicket } from '@sysjb/database';
import type { UserSession } from '../auth/session.types.js';
import { AppError, Errors } from '../common/app-error.js';
import { hasSqlState, isUniqueViolation } from '../common/prisma-errors.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import { DrawsService } from '../draws/draws.service.js';
import { QuotesService } from '../quotes/quotes.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { toPublicWallet } from '../users/user.mapper.js';
import type { PlaceLotteryTicketsInput, RepeatLotteryTicketInput } from './lotteries.schemas.js';

const invalid = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Payload inválido.', [{ field, message }]);
const drawClosed = () => new AppError(409, 'DRAW_CLOSED', 'Extração encerrada. Escolha outra.');
/** Pule inexistente, de outro jogador, de outra banca ou da Fazendinha: mesma resposta (não revela nada). */
const invalidPule = () => new AppError(404, 'NOT_FOUND', 'Pule inválida.');
const modalityUnavailable = () =>
  new AppError(409, 'CONFLICT', 'Esta pule tem uma modalidade que não está mais disponível.');

const toDate = (drawDate: string) => new Date(`${drawDate}T00:00:00Z`);
/** Horário limite no dia da extração, em Brasília (sem horário de verão: sempre -03:00). O trigger grava o do cadastro. */
const closesAtOf = (drawDate: string, draw: PublicDraw) => new Date(`${drawDate}T${draw.closesAt}:00-03:00`);

export interface ItemRow {
  position: number;
  modality: string;
  placement: string;
  guesses: string[];
  amountCents: bigint;
  split: string;
  totalCents: bigint;
  quoteCents: number;
  possiblePrizeCents: bigint;
}

export type TicketWithItems = LotteryTicket & { items: ItemRow[] };

/** Mesmo item? (palpites na ordem enviada; valores em centavos) */
const sameItem = (a: ItemRow, b: PlaceLotteryTicketsInput['items'][number]) =>
  a.modality === b.modality &&
  a.placement === b.placement &&
  a.split === b.split &&
  a.amountCents === BigInt(b.amountCents) &&
  a.guesses.join(',') === b.guesses.join(',');

/**
 * Venda de loterias (Tradicional): valida contra o cadastro de sorteios e a cotação da banca, grava um pule por extração
 * e debita cada um, tudo numa transação.
 */
@Injectable()
export class LotteriesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(QuotesService) private readonly quotes: QuotesService,
    @Inject(DrawsService) private readonly drawsService: DrawsService,
  ) {}

  async place(
    tenant: ResolvedTenant,
    session: UserSession,
    input: PlaceLotteryTicketsInput,
  ): Promise<PlaceLotteryTicketsResponse> {
    const now = new Date().toISOString();
    const dayOffset = dayOffsetOf(now, input.drawDate);
    if (dayOffset === null) throw invalid('drawDate', 'Data inválida.');
    for (const [i, requested] of input.draws.entries()) {
      if (input.draws.findIndex((d) => d.name === requested.name) !== i) {
        throw invalid(`draws.${i}`, 'Loteria repetida.');
      }
    }

    // Repetição da mesma tentativa (clique duplo, reenvio após falha de rede): devolve os pules já criados ANTES
    // de validar horário e cotação — a compra já foi feita e debitada, mesmo que a extração tenha fechado depois.
    const existing = await this.findByKey(tenant.id, session.userId, input.idempotencyKey);
    if (existing.length > 0) return this.replay(tenant.id, existing, input);

    try {
      // Uma transação para tudo: sorteios, cotação, pules e débitos (poucas idas ao banco, leitura consistente).
      return await this.db.withTenant(tenant.id, async (tx) => {
        const found = await this.drawsService.forSale(tx, tenant.id, input.draws, 'lotteries', input.drawDate);
        const draws = found.map((draw, i) => {
          if (!draw) throw invalid(`draws.${i}`, 'Loteria inexistente ou sem sorteio nesse dia.');
          return draw;
        });
        if (draws.some((d) => !isDrawOpenAt(now, dayOffset, d.closesAt))) throw drawClosed();

        const quotes = await this.quotes.loadForSale(tx, tenant.id);
        const items = input.items.map((item, i) => toItemRow(item, i, quotes));
        const ticketTotal = items.reduce((sum, item) => sum + item.totalCents, 0n);
        if (ticketTotal * BigInt(draws.length) > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw invalid('items', 'Valor muito alto.');
        }

        // Pules na ordem do id do sorteio: a venda trava cada sorteio (FOR SHARE) e o feriado do painel trava
        // todos nessa mesma ordem, então os dois nunca se esperam em ciclo (deadlock).
        const created = new Map<string, TicketWithItems>();
        for (const draw of [...draws].sort((a, b) => a.id.localeCompare(b.id))) {
          const ticket = await tx.lotteryTicket.create({
            data: {
              tenantId: tenant.id,
              userId: session.userId,
              purchaseKey: input.idempotencyKey,
              drawDate: toDate(input.drawDate),
              lottery: draw.name,
              drawHour: draw.hour,
              closesAt: closesAtOf(input.drawDate, draw),
              totalCents: ticketTotal,
              quoteTable: quotes.tableLabel,
            },
          });
          await tx.lotteryTicketItem.createMany({
            data: items.map((item) => ({ ...item, tenantId: tenant.id, ticketId: ticket.id })),
          });
          await tx.$executeRaw`SELECT lottery_debit(${ticket.id}::uuid)`;
          created.set(draw.id, { ...ticket, items });
        }
        // Resposta na ordem escolhida pelo jogador.
        return this.response(
          tx,
          tenant.id,
          session.userId,
          draws.map((d) => created.get(d.id)!),
        );
      });
    } catch (error) {
      if (hasSqlState(error, 'SJ001')) throw new AppError(409, 'INSUFFICIENT_FUNDS', 'Saldo insuficiente.');
      // O banco confere o fechamento de novo (a extração pode fechar entre a validação e o INSERT).
      if (hasSqlState(error, 'SJ002')) throw drawClosed();
      if (isUniqueViolation(error) && JSON.stringify(error.meta ?? {}).includes('purchase_key')) {
        const raced = await this.findByKey(tenant.id, session.userId, input.idempotencyKey);
        if (raced.length > 0) return this.replay(tenant.id, raced, input);
      }
      throw error;
    }
  }

  /**
   * Repetir pule: as apostas (modalidade, colocação, palpites, valor e divisão) vêm de uma pule de Loterias do
   * PRÓPRIO jogador; a compra passa pela mesma venda (sorteios, horário, saldo, débito e idempotência), com a
   * cotação de agora. Pule de outro jogador nunca é lida: o número é sequencial e as apostas não são públicas.
   */
  async repeat(
    tenant: ResolvedTenant,
    session: UserSession,
    input: RepeatLotteryTicketInput,
  ): Promise<PlaceLotteryTicketsResponse> {
    const items = await this.db.withTenant(tenant.id, async (tx) => {
      const original = await tx.lotteryTicket.findFirst({
        where: { tenantId: tenant.id, userId: session.userId, puleNumber: input.puleNumber },
        select: {
          items: {
            orderBy: { position: 'asc' },
            select: { modality: true, placement: true, guesses: true, amountCents: true, split: true },
          },
        },
      });
      if (!original || original.items.length === 0) throw invalidPule();
      const quotes = await this.quotes.loadForSale(tx, tenant.id);
      return original.items.map((item) => {
        const modality = findLotteryModality(item.modality);
        const quoteCents = modality ? lotteryQuoteCents(modality, quotes) : 0;
        if (quoteCents <= 0) throw modalityUnavailable();
        return {
          modality: item.modality,
          placement: item.placement,
          guesses: item.guesses,
          amountCents: Number(item.amountCents),
          split: item.split === 'each' ? ('each' as const) : ('total' as const),
          quoteCents,
        };
      });
    });
    return this.place(tenant, session, {
      idempotencyKey: input.idempotencyKey,
      drawDate: input.drawDate,
      draws: input.draws,
      items,
    });
  }

  private findByKey(tenantId: string, userId: string, purchaseKey: string): Promise<TicketWithItems[]> {
    return this.db.withTenant(tenantId, (tx) =>
      tx.lotteryTicket.findMany({
        where: { tenantId, userId, purchaseKey },
        include: { items: { orderBy: { position: 'asc' } } },
        orderBy: { puleNumber: 'asc' },
      }),
    );
  }

  /**
   * Mesma chave com outra compra (data, loterias ou itens diferentes) é erro do cliente; com a mesma compra,
   * devolve os pules originais, na ordem pedida.
   */
  private replay(
    tenantId: string,
    existing: TicketWithItems[],
    input: PlaceLotteryTicketsInput,
  ): Promise<PlaceLotteryTicketsResponse> {
    const ordered = input.draws.map((d) => existing.find((t) => t.lottery === d.name && t.drawHour === d.hour));
    const same =
      existing.length === input.draws.length &&
      ordered.every(
        (t) =>
          t !== undefined &&
          t.drawDate.getTime() === toDate(input.drawDate).getTime() &&
          t.items.length === input.items.length &&
          t.items.every((item, i) => sameItem(item, input.items[i]!)),
      );
    if (!same) throw new AppError(409, 'CONFLICT', 'Chave de compra já usada em outra aposta.');
    return this.db.withTenant(tenantId, (tx) =>
      this.response(tx, tenantId, existing[0]!.userId, ordered as TicketWithItems[]),
    );
  }

  private async response(
    tx: TenantTx,
    tenantId: string,
    userId: string,
    tickets: TicketWithItems[],
  ): Promise<PlaceLotteryTicketsResponse> {
    const user = await tx.user.findFirst({
      where: { tenantId, id: userId },
      select: { displayId: true, wallet: true },
    });
    if (!user?.wallet) throw Errors.internal();
    const publicTickets = tickets.map((t) => toPublicTicket(t, user.displayId));
    return {
      tickets: publicTickets,
      totalCents: publicTickets.reduce((sum, t) => sum + t.totalCents, 0),
      wallet: toPublicWallet(user.wallet),
    };
  }
}

/** Confere e monta um item com a cotação atual da banca (nunca vende por prêmio diferente do que o jogador viu). */
function toItemRow(item: PlaceLotteryTicketsInput['items'][number], i: number, quotes: PublicQuotes): ItemRow {
  const modality = findLotteryModality(item.modality);
  if (!modality) throw invalid(`items.${i}.modality`, 'Modalidade inexistente.');
  const placement = findLotteryPlacement(item.placement);
  if (!placement || !placementsFor(modality).includes(placement)) {
    throw invalid(`items.${i}.placement`, 'Colocação não aceita para esta modalidade.');
  }
  if (new Set(item.guesses).size !== item.guesses.length) throw invalid(`items.${i}.guesses`, 'Palpites repetidos.');
  if (!item.guesses.every((g) => isValidLotteryGuess(modality, g))) {
    throw invalid(`items.${i}.guesses`, 'Palpite inválido para a modalidade.');
  }
  // "Todos": cada palpite recebe pelo menos 1 centavo.
  if (item.split === 'total' && item.amountCents < item.guesses.length) {
    throw invalid(`items.${i}.amountCents`, 'Valor menor que a quantidade de palpites.');
  }
  const quoteCents = lotteryQuoteCents(modality, quotes);
  if (quoteCents <= 0) throw invalid(`items.${i}.modality`, 'Modalidade não disponível.');
  if (quoteCents !== item.quoteCents) {
    throw new AppError(409, 'QUOTE_CHANGED', 'A cotação mudou. Confira os prêmios antes de apostar.');
  }
  return {
    position: i + 1,
    modality: modality.id,
    placement: placement.id,
    guesses: item.guesses,
    amountCents: BigInt(item.amountCents),
    split: item.split,
    totalCents: BigInt(lotteryItemTotalCents(item.amountCents, item.split, item.guesses.length)),
    quoteCents,
    possiblePrizeCents: BigInt(
      lotteryPossiblePrizeCents(modality, placement, item.guesses, item.amountCents, item.split, quoteCents),
    ),
  };
}

/** Pule de Loterias (com os itens) -> comprovante público (compra e Consultar pule). */
export function toPublicTicket(ticket: TicketWithItems, sellerId: number): PublicLotteryTicket {
  return {
    puleNumber: ticket.puleNumber,
    drawDate: ticket.drawDate.toISOString().slice(0, 10),
    lottery: ticket.lottery,
    hour: ticket.drawHour,
    items: ticket.items.map((item) => ({
      modality: item.modality,
      modalityLabel: findLotteryModality(item.modality)?.label ?? item.modality.toUpperCase(),
      placement: item.placement,
      placementLabel: findLotteryPlacement(item.placement)?.label ?? item.placement,
      guesses: item.guesses,
      amountCents: Number(item.amountCents),
      split: item.split === 'each' ? 'each' : 'total',
      totalCents: Number(item.totalCents),
      quoteCents: item.quoteCents,
      possiblePrizeCents: Number(item.possiblePrizeCents),
    })),
    totalCents: Number(ticket.totalCents),
    quoteTable: ticket.quoteTable,
    createdAt: ticket.createdAt.toISOString(),
    sellerId,
  };
}
