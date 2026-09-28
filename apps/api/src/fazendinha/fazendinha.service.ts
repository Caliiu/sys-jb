import { Inject, Injectable } from '@nestjs/common';
import {
  fazendinhaPrizeFrom,
  type FazendinhaModeId,
  type FazendinhaSoldEntry,
  type PlaceFazendinhaBetResponse,
  type PublicFazendinhaBet,
  dayOffsetOf,
  findFazendinhaMode,
  isDrawOpenAt,
  isValidPalpite,
} from '@sysjb/contracts';
import type { FazendinhaBet, FazendinhaMode } from '@sysjb/database';
import type { UserSession } from '../auth/session.types.js';
import { AppError, Errors } from '../common/app-error.js';
import { hasSqlState, isUniqueViolation } from '../common/prisma-errors.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import { DrawsService } from '../draws/draws.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { toPublicWallet } from '../users/user.mapper.js';
import { QuotesService } from '../quotes/quotes.service.js';
import type { PlaceBetInput } from './fazendinha.schemas.js';

const TO_DB_MODE: Record<FazendinhaModeId, FazendinhaMode> = { grupo: 'GRUPO', dezena: 'DEZENA', centena: 'CENTENA' };
const FROM_DB_MODE: Record<FazendinhaMode, FazendinhaModeId> = { GRUPO: 'grupo', DEZENA: 'dezena', CENTENA: 'centena' };

/** SQLSTATEs próprios: fazendinha_debit (saldo + prêmios não cobrem o total) e o trigger de fechamento. */
const INSUFFICIENT_FUNDS_SQLSTATE = 'SJ001';
const DRAW_CLOSED_SQLSTATE = 'SJ002';

const drawClosed = () => new AppError(409, 'DRAW_CLOSED', 'Extração encerrada. Escolha outra.');

const invalid = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Payload inválido.', [{ field, message }]);

const toDate = (drawDate: string) => new Date(`${drawDate}T00:00:00Z`);
const fromDate = (date: Date) => date.toISOString().slice(0, 10);

/** Venda de palpites da Fazendinha: valida contra o cadastro de sorteios, grava o pule e debita a carteira na mesma transação. */
@Injectable()
export class FazendinhaService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(QuotesService) private readonly quotes: QuotesService,
    @Inject(DrawsService) private readonly draws: DrawsService,
  ) {}

  async place(tenant: ResolvedTenant, session: UserSession, input: PlaceBetInput): Promise<PlaceFazendinhaBetResponse> {
    const mode = findFazendinhaMode(input.mode)!;
    if (!input.numbers.every((n) => isValidPalpite(mode, n))) throw invalid('numbers', 'Palpite fora da modalidade.');

    const now = new Date().toISOString();
    const dayOffset = dayOffsetOf(now, input.drawDate);
    if (dayOffset === null) throw invalid('drawDate', 'Data inválida.');

    const numbers = [...input.numbers].sort((a, b) => a - b);
    // Identidade da cartela (extração + modalidade + valor), para o reenvio e para os números já vendidos.
    const card = {
      drawDate: toDate(input.drawDate),
      lottery: input.lottery,
      drawHour: input.hour,
      mode: TO_DB_MODE[mode.id],
      stakeCents: input.stakeCents,
    };

    // Repetição da mesma tentativa (clique duplo, reenvio após falha de rede): devolve o pule já criado ANTES de
    // validar horário e cotação — a compra já foi feita e debitada, mesmo que a extração tenha fechado depois.
    const existing = await this.findByKey(tenant.id, session.userId, input.idempotencyKey);
    if (existing) return this.replay(existing, card, numbers);

    try {
      // Uma transação para tudo: sorteio, cotação (com trava: o gerente não troca a tabela no meio), pule e débito.
      return await this.db.withTenant(tenant.id, async (tx) => {
        const [lottery] = await this.draws.forSale(
          tx,
          tenant.id,
          [{ name: input.lottery, hour: input.hour }],
          'fazendinha',
          input.drawDate,
        );
        if (!lottery) throw invalid('lottery', 'Extração inexistente ou sem sorteio nesse dia.');
        if (!isDrawOpenAt(now, dayOffset, lottery.closesAt)) throw drawClosed();

        // Cotação da banca: só os valores com prêmio são oferecidos; o prêmio fica gravado no pule.
        const prizeCents = fazendinhaPrizeFrom(await this.quotes.loadForSale(tx, tenant.id), mode.id, input.stakeCents);
        if (prizeCents <= 0) throw invalid('stakeCents', 'Valor não disponível.');
        // Nunca vender por um prêmio diferente do que o jogador viu.
        if (prizeCents !== input.prizeCents) {
          throw new AppError(409, 'QUOTE_CHANGED', 'A cotação mudou. Confira o novo prêmio antes de apostar.');
        }

        const created = await tx.fazendinhaBet.create({
          data: {
            ...card,
            tenantId: tenant.id,
            userId: session.userId,
            idempotencyKey: input.idempotencyKey,
            prizeCents,
            // Histórico: prêmio ÷ valor (a cotação é livre, pode não ser inteira).
            multiplier: Math.floor(prizeCents / input.stakeCents),
            totalCents: BigInt(input.stakeCents) * BigInt(numbers.length),
          },
        });
        await tx.fazendinhaBetNumber.createMany({
          data: numbers.map((number) => ({ ...card, tenantId: tenant.id, betId: created.id, number })),
        });
        // $executeRaw: a função retorna void, que o $queryRaw não sabe desserializar.
        await tx.$executeRaw`SELECT fazendinha_debit(${created.id}::uuid)`;
        return this.response(tx, created, numbers);
      });
    } catch (error) {
      if (hasSqlState(error, INSUFFICIENT_FUNDS_SQLSTATE)) {
        throw new AppError(409, 'INSUFFICIENT_FUNDS', 'Saldo insuficiente.');
      }
      // O banco confere o fechamento de novo (a extração pode fechar entre a validação e o INSERT).
      if (hasSqlState(error, DRAW_CLOSED_SQLSTATE)) throw drawClosed();
      if (isUniqueViolation(error)) {
        if (JSON.stringify(error.meta ?? {}).includes('idempotency_key')) {
          const raced = await this.findByKey(tenant.id, session.userId, input.idempotencyKey);
          if (raced) return this.replay(raced, card, numbers);
        }
        throw await this.unavailable(tenant.id, card, numbers);
      }
      throw error;
    }
  }

  /** Números já vendidos no dia, agrupados por extração/modalidade/valor. Só números: nada de quem comprou. */
  async sold(tenant: ResolvedTenant, drawDate: string): Promise<FazendinhaSoldEntry[]> {
    if (dayOffsetOf(new Date().toISOString(), drawDate) === null) throw invalid('drawDate', 'Data inválida.');

    const rows = await this.db.withTenant(tenant.id, (tx) =>
      tx.fazendinhaBetNumber.findMany({
        where: { tenantId: tenant.id, drawDate: toDate(drawDate) },
        select: { lottery: true, drawHour: true, mode: true, stakeCents: true, number: true },
        orderBy: [{ drawHour: 'asc' }, { lottery: 'asc' }, { mode: 'asc' }, { stakeCents: 'asc' }, { number: 'asc' }],
      }),
    );

    const entries = new Map<string, FazendinhaSoldEntry>();
    for (const row of rows) {
      const key = `${row.lottery}|${row.drawHour}|${row.mode}|${row.stakeCents}`;
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          lottery: row.lottery,
          hour: row.drawHour,
          mode: FROM_DB_MODE[row.mode],
          stakeCents: row.stakeCents,
          numbers: [],
        };
        entries.set(key, entry);
      }
      entry.numbers.push(row.number);
    }
    return [...entries.values()];
  }

  private findByKey(tenantId: string, userId: string, idempotencyKey: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.fazendinhaBet.findUnique({
        where: { tenantId_userId_idempotencyKey: { tenantId, userId, idempotencyKey } },
        include: { numbers: { select: { number: true }, orderBy: { number: 'asc' } } },
      }),
    );
  }

  /** Mesma chave com outra aposta é erro do cliente; com a mesma aposta, devolve o pule original. */
  private replay(
    existing: FazendinhaBet & { numbers: Array<{ number: number }> },
    bet: Pick<FazendinhaBet, 'drawDate' | 'lottery' | 'drawHour' | 'mode' | 'stakeCents'>,
    numbers: number[],
  ): Promise<PlaceFazendinhaBetResponse> {
    const stored = existing.numbers.map((n) => n.number);
    const same =
      existing.drawDate.getTime() === bet.drawDate.getTime() &&
      existing.lottery === bet.lottery &&
      existing.drawHour === bet.drawHour &&
      existing.mode === bet.mode &&
      existing.stakeCents === bet.stakeCents &&
      stored.join(',') === numbers.join(',');
    if (!same) throw new AppError(409, 'CONFLICT', 'Chave de compra já usada em outra aposta.');
    return this.db.withTenant(existing.tenantId, (tx) => this.response(tx, existing, stored));
  }

  private async response(tx: TenantTx, bet: FazendinhaBet, numbers: number[]): Promise<PlaceFazendinhaBetResponse> {
    const user = await tx.user.findFirst({
      where: { tenantId: bet.tenantId, id: bet.userId },
      select: { displayId: true, wallet: true },
    });
    if (!user?.wallet) throw Errors.internal();
    const { tableLabel } = await this.quotes.load(tx, bet.tenantId);
    return { bet: toPublicBet(bet, numbers, user.displayId, tableLabel), wallet: toPublicWallet(user.wallet) };
  }

  /** 409 com os números que outra pessoa comprou primeiro (details: "numbers" -> "4,17"). */
  private async unavailable(
    tenantId: string,
    bet: Pick<FazendinhaBet, 'drawDate' | 'lottery' | 'drawHour' | 'mode' | 'stakeCents'>,
    numbers: number[],
  ): Promise<AppError> {
    const taken = await this.db.withTenant(tenantId, (tx) =>
      tx.fazendinhaBetNumber.findMany({
        where: {
          tenantId,
          drawDate: bet.drawDate,
          lottery: bet.lottery,
          drawHour: bet.drawHour,
          mode: bet.mode,
          stakeCents: bet.stakeCents,
          number: { in: numbers },
        },
        select: { number: true },
        orderBy: { number: 'asc' },
      }),
    );
    return new AppError(409, 'NUMBERS_UNAVAILABLE', 'Alguns palpites já foram vendidos.', [
      { field: 'numbers', message: taken.map((t) => t.number).join(',') },
    ]);
  }
}

function toPublicBet(bet: FazendinhaBet, numbers: number[], sellerId: number, quoteTable: string): PublicFazendinhaBet {
  return {
    puleNumber: bet.puleNumber,
    drawDate: fromDate(bet.drawDate),
    lottery: bet.lottery,
    hour: bet.drawHour,
    mode: FROM_DB_MODE[bet.mode],
    stakeCents: bet.stakeCents,
    prizeCents: bet.prizeCents,
    quoteTable,
    numbers,
    totalCents: Number(bet.totalCents),
    createdAt: bet.createdAt.toISOString(),
    sellerId,
  };
}
