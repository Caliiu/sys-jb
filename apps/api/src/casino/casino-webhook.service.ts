import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig, digestKey } from '../config/config.js';
import { hasSqlState, isUniqueViolation } from '../common/prisma-errors.js';
import { DatabaseService, type TenantTx, enterTenant } from '../database/database.service.js';
import { displayIdFromUserCode } from './casino-user-code.js';

/** Resposta ao provedor: saldo em reais (moeda do agente) e o código do resultado, no formato do PlayFivers. */
export interface CasinoWebhookReply {
  status: 200 | 400 | 401 | 404 | 500;
  body: { msg: string; balance: number };
}

const ID_RE = /^[\x21-\x7e]{1,128}$/;
const PROVIDER_RE = /^[A-Za-z0-9][A-Za-z0-9 ._()&-]{0,59}$/;
const GAME_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const TXN_TYPES = new Set(['debit_credit', 'debit', 'credit', 'bonus']);
/** Maior valor aceito numa rodada: R$ 1 bilhão (mesmo teto do banco, em centavos). */
const MAX_CENTS = 100_000_000_000;

const reply = (status: CasinoWebhookReply['status'], msg: string, balanceCents = 0): CasinoWebhookReply => ({
  status,
  body: { msg, balance: balanceCents / 100 },
});
const invalidUser = () => reply(404, 'INVALID_USER');
const internal = () => reply(500, 'ERROR_INTERNAL');

/** Reais (número ou texto numérico) -> centavos inteiros; null se não for um valor válido. */
export function toCents(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  const cents = Math.round(n * 100);
  return cents <= MAX_CENTS ? cents : null;
}

const text = (value: unknown) =>
  typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';

/** Texto com o mesmo digest e tempo constante: não revela por tempo o quanto do segredo bateu. */
const sameSecret = (presented: unknown, expected: string) =>
  typeof presented === 'string' && timingSafeEqual(digestKey(presented), digestKey(expected));

interface Round {
  txnId: string;
  roundId: string | null;
  provider: string;
  gameCode: string;
  txnType: string;
  betCents: number;
  winCents: number;
}

/**
 * Webhook do PlayFivers (o token do endereço já foi conferido pelo CasinoWebhookGuard):
 *  - BALANCE: saldo do jogador (gastável do Disponível Games: saldo + prêmios de games).
 *  - WinBet: uma rodada (aposta e/ou prêmio). Confere o segredo do agente, aplica uma vez só por txn_id
 *    (casino_apply_transaction) e devolve o saldo depois. Repetição da mesma rodada responde o saldo atual.
 * O jogador vem pelo user_code ("10000 Carlos - Trevo da Sorte", ver casino-user-code.ts) sem banca: só o ID do início
 * vale; a transação acha só aquela linha (app.casino_user) e entra na banca dele. Nada do corpo vai para o log.
 */
@Injectable()
export class CasinoWebhookService {
  private readonly logger = new Logger('CasinoWebhook');

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  async receive(body: unknown): Promise<CasinoWebhookReply> {
    const casino = this.config.casino;
    if (!casino || typeof body !== 'object' || body === null || Array.isArray(body)) return internal();
    const data = body as Record<string, unknown>;
    const type = text(data.type).toUpperCase();
    const displayId = displayIdFromUserCode(text(data.user_code));
    if (displayId === null) return invalidUser();

    if (type === 'BALANCE') return this.balance(displayId);
    if (type !== 'WINBET') return internal();

    if (!sameSecret(data.agent_secret, casino.secretKey)) return reply(401, 'INVALID_AGENT');
    if (casino.agentCode !== null && !sameSecret(data.agent_code, casino.agentCode)) return reply(401, 'INVALID_AGENT');
    const round = parseRound(data.slot);
    if (!round) {
      this.logger.warn('rodada do cassino fora do formato: recusada');
      return internal();
    }
    return this.apply(displayId, round);
  }

  /** Transação na banca do jogador do ID (null se não existir). */
  private withPlayer<T>(
    displayId: number,
    fn: (tx: TenantTx, user: { id: string; tenantId: string }) => Promise<T>,
  ): Promise<T | null> {
    return this.db.withLookup('app.casino_user', String(displayId), async (tx) => {
      const user = await tx.user.findFirst({ where: { displayId }, select: { id: true, tenantId: true } });
      if (!user) return null;
      await enterTenant(tx, user.tenantId);
      return fn(tx, user);
    });
  }

  private async balance(displayId: number): Promise<CasinoWebhookReply> {
    try {
      const wallet = await this.withPlayer(displayId, (tx, user) =>
        tx.wallet.findFirst({
          where: { tenantId: user.tenantId, userId: user.id },
          select: { balanceGames: true, prizesGames: true },
        }),
      );
      if (!wallet) return invalidUser();
      return reply(200, '', Number(wallet.balanceGames + wallet.prizesGames));
    } catch {
      this.logger.error('saldo do cassino: falha inesperada');
      return internal();
    }
  }

  private async apply(displayId: number, round: Round): Promise<CasinoWebhookReply> {
    try {
      const result = await this.withPlayer(displayId, async (tx, user) => {
        const [row] = await tx.$queryRaw<Array<{ balance: bigint; applied: boolean }>>`
          SELECT "balance", "applied" FROM casino_apply_transaction(
            ${user.id}::uuid, ${round.txnId}, ${round.roundId}, ${round.provider}, ${round.gameCode},
            ${round.txnType}, ${round.betCents}::bigint, ${round.winCents}::bigint)`;
        return row ?? null;
      });
      if (!result) return invalidUser();
      return reply(200, '', Number(result.balance));
    } catch (error) {
      if (hasSqlState(error, 'SJ001')) return reply(400, 'INSUFFICIENT_USER_FUNDS');
      // Jogador bloqueado tentando apostar, ou sem carteira.
      if (hasSqlState(error, 'P0002')) return invalidUser();
      if (hasSqlState(error, 'SJ010') || isUniqueViolation(error)) {
        this.logger.warn('rodada do cassino com txn_id repetido e valores diferentes: recusada');
        return internal();
      }
      this.logger.error('rodada do cassino: falha inesperada');
      return internal();
    }
  }
}

/** Campos da rodada (slot) conferidos; null se algo estiver fora do formato. */
function parseRound(slot: unknown): Round | null {
  if (typeof slot !== 'object' || slot === null || Array.isArray(slot)) return null;
  const s = slot as Record<string, unknown>;
  const txnId = text(s.txn_id);
  const roundRaw = text(s.round_id);
  const provider = text(s.provider_code);
  const gameCode = text(s.game_code);
  const txnType = text(s.txn_type).toLowerCase();
  const betCents = toCents(s.bet ?? 0);
  const winCents = toCents(s.win ?? 0);
  if (!ID_RE.test(txnId) || (roundRaw !== '' && !ID_RE.test(roundRaw))) return null;
  if (!PROVIDER_RE.test(provider) || !GAME_CODE_RE.test(gameCode) || !TXN_TYPES.has(txnType)) return null;
  if (betCents === null || winCents === null) return null;
  return { txnId, roundId: roundRaw || null, provider, gameCode, txnType, betCents, winCents };
}
