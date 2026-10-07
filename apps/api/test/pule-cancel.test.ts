import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminTicketList,
  type AdminUserDetail,
  type LoginResponse,
  type PlaceLotteryTicketsResponse,
  type PuleDetail,
  type PuleList,
  type PublicUser,
  defaultQuotes,
  drawDateOf,
  findLotteryModality,
  lotteryQuoteCents,
} from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  asTenant,
  createUser,
  KEYS,
  loginOperator,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  SYNTHETIC_PASSWORD,
  tenantId,
  settleAll,
} from './helpers.js';

let app: INestApplication;
let auroraId: string;

beforeAll(async () => {
  app = await startApp();
  auroraId = await tenantId('aurora');
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

type Session = Awaited<ReturnType<typeof loginOperator>>;

const NOW = new Date().toISOString();
const TODAY = drawDateOf(NOW, 0);
const TOMORROW = drawDateOf(NOW, 1);
const RIO_09 = { name: 'LT PT RIO 09HS', hour: 9 };

/** Jogador (indicado por `referrer`, se houver) com saldo e prêmios para apostar. */
async function player(referrer: PublicUser | null, balanceCents = 10_000, prizesCents = 0) {
  const person = await createUser(app, 'aurora', referrer ? { inviteCode: referrer.inviteCode } : {});
  await asTenant(migratorPool, auroraId, (c) =>
    c.query("SELECT wallet_manual_adjust($1, $2, $3, 0, 'fundos de teste')", [person.id, balanceCents, prizesCents]),
  );
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return { person, http: api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token }) };
}
type Player = Awaited<ReturnType<typeof player>>;

/** Compra um pule de Loterias para amanhã; devolve o número. */
async function buy({ http }: Player, amountCents: number): Promise<number> {
  const res = await http.post('/v1/lotteries/tickets', {
    idempotencyKey: randomUUID(),
    game: 'tradicional',
    drawDate: TOMORROW,
    draws: [RIO_09],
    items: [
      {
        modality: 'milhar',
        placement: 'p1',
        guesses: ['3452'],
        amountCents,
        split: 'total',
        quoteCents: lotteryQuoteCents(findLotteryModality('milhar')!, defaultQuotes()),
      },
    ],
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as PlaceLotteryTicketsResponse).tickets[0]!.puleNumber;
}

const cancel = ({ http }: Player, pule: number) => http.post(`/v1/me/pules/${pule}/cancel`, {});

const walletOf = async (session: Session, userId: string) =>
  ((await session.http.get(`/v1/admin/users/${userId}`)).body as AdminUserDetail).wallet;

const kinds = (userId: string) =>
  asTenant(migratorPool, auroraId, (c) =>
    c.query(
      `SELECT kind, balance_jb_delta::int AS balance, prizes_jb_delta::int AS prizes FROM wallet_entries
       WHERE user_id = $1 AND kind <> 'MANUAL_ADJUSTMENT' ORDER BY created_at`,
      [userId],
    ),
  ).then((r) => r.rows);

describe('POST /v1/me/pules/:numero/cancel', () => {
  it('devolve a aposta às mesmas bolsas, marca a pule e anula a comissão pendente de quem indicou', async () => {
    const session = await loginOperator(app, 'aurora');
    await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 300 });
    const promoter = await createUser(app, 'aurora');
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 700 });
    // R$ 10 de saldo e R$ 5 de prêmios: a aposta de R$ 12 tira R$ 10 do saldo e R$ 2 dos prêmios.
    const bettor = await player(promoter, 1_000, 500);

    const pule = await buy(bettor, 1_200);
    // Comissão pendente (paga só na apuração).
    expect((await walletOf(session, promoter.id)).balanceJb).toBe(0);

    const res = await cancel(bettor, pule);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ game: 'lotteries', cancellable: false, canceledAt: expect.any(String) });

    expect(await walletOf(session, bettor.person.id)).toMatchObject({ balanceJb: 1_000, prizesJb: 500 });
    expect(await kinds(bettor.person.id)).toEqual([
      { kind: 'LOTTERY_BET', balance: -1_000, prizes: -200 },
      { kind: 'LOTTERY_REFUND', balance: 1_000, prizes: 200 },
    ]);
    // Nada foi pago a quem indicou, então não há o que estornar: a comissão só deixa de existir.
    expect((await walletOf(session, promoter.id)).balanceJb).toBe(0);
    expect(await kinds(promoter.id)).toEqual([]);
    const commission = await asTenant(migratorPool, auroraId, (c) =>
      c.query(
        `SELECT credited_at IS NOT NULL AS paid, reversed_at IS NOT NULL AS canceled, reversed_cents::int AS back
         FROM bet_commissions`,
      ),
    );
    expect(commission.rows).toEqual([{ paid: false, canceled: true, back: 0 }]);
    // E a apuração não paga a comissão de pule cancelado.
    await settleAll(app, 'aurora');
    expect((await walletOf(session, promoter.id)).balanceJb).toBe(0);

    // A pule continua consultável, cancelada; a lista do dia separa registradas e canceladas.
    const detail = (await bettor.http.get(`/v1/me/pules/${pule}`)).body as PuleDetail;
    expect(detail).toMatchObject({ cancellable: false, canceledAt: expect.any(String) });
    const list = (await bettor.http.get(`/v1/me/pules?date=${TODAY}`)).body as PuleList;
    expect(list).toMatchObject({ registeredCents: 0, canceledCents: 1_200 });
    expect(list.pules.map((p) => [p.puleNumber, p.status])).toEqual([[pule, 'canceled']]);

    // No painel: marcada como cancelada e fora do total vendido.
    const tickets = (await session.http.get(`/v1/admin/tickets?date=${TODAY}`)).body as AdminTicketList;
    expect(tickets.items.map((t) => [t.puleNumber, t.canceledAt !== null])).toEqual([[pule, true]]);
    expect(tickets.totalCents).toBe(0);
    const summary = await session.http.get(`/v1/admin/operation-summary?from=${TODAY}&to=${TODAY}`);
    expect(summary.body.result).toMatchObject({ wageredCents: 0, commissionCents: 0 });
  });

  it('comissão já paga (pule de antes da regra nova) e já gasta: estorna o que houver e registra o resto', async () => {
    const session = await loginOperator(app, 'aurora');
    await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 1_000 });
    const referrer = await createUser(app, 'aurora');
    const bettor = await player(referrer);
    const pule = await buy(bettor, 1_000);
    // Como na regra antiga, a comissão de R$ 1 já foi paga (a dona das tabelas executa o pagamento direto).
    await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT bet_commission_pay($1, (SELECT id FROM lottery_tickets WHERE pule_number = $2), NULL)', [
        auroraId,
        pule,
      ]),
    );
    expect((await walletOf(session, referrer.id)).balanceJb).toBe(100);
    // Ele gasta R$ 0,70 do saldo e tem R$ 0,20 em prêmios.
    await asTenant(migratorPool, auroraId, (c) =>
      c.query("SELECT wallet_manual_adjust($1, -70, 20, 0, 'gasto de teste')", [referrer.id]),
    );

    expect((await cancel(bettor, pule)).status).toBe(200);
    expect(await walletOf(session, referrer.id)).toMatchObject({ balanceJb: 0, prizesJb: 0 });
    expect((await kinds(referrer.id)).at(-1)).toEqual({ kind: 'COMMISSION_REVERSAL', balance: -30, prizes: -20 });
    const row = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT reversed_cents::int AS reversed, reversed_at IS NOT NULL AS done FROM bet_commissions'),
    );
    expect(row.rows).toEqual([{ reversed: 50, done: true }]);
    // A aposta volta inteira para quem apostou.
    expect((await walletOf(session, bettor.person.id)).balanceJb).toBe(10_000);
  });

  it('sem comissão a estornar (veio sem convite): só devolve', async () => {
    const bettor = await player(null);
    const pule = await buy(bettor, 500);
    expect((await cancel(bettor, pule)).status).toBe(200);
    expect(await kinds(bettor.person.id)).toEqual([
      { kind: 'LOTTERY_BET', balance: -500, prizes: 0 },
      { kind: 'LOTTERY_REFUND', balance: 500, prizes: 0 },
    ]);
  });

  it('uma vez só: repetir dá 409; pedidos simultâneos devolvem uma vez', async () => {
    const bettor = await player(null);
    const pule = await buy(bettor, 500);
    const results = await Promise.all([1, 2, 3].map(() => cancel(bettor, pule)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    const again = await cancel(bettor, pule);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'CONFLICT', message: 'Esta pule já foi cancelada.' });
    expect((await kinds(bettor.person.id)).filter((e) => e.kind === 'LOTTERY_REFUND')).toHaveLength(1);
  });

  it('prazo de 5 minutos: o recibo informa até quando; depois dele, 409 e nada muda', async () => {
    const bettor = await player(null);
    const pule = await buy(bettor, 500);
    const fresh = (await bettor.http.get(`/v1/me/pules/${pule}`)).body as Extract<PuleDetail, { game: 'lotteries' }>;
    expect(fresh.cancellable).toBe(true);
    const until = Date.parse(fresh.cancellableUntil!);
    const sold = Date.parse(fresh.ticket.createdAt);
    expect(until - sold).toBe(5 * 60_000);

    // Aposta feita há 6 minutos (a dona das tabelas pode mexer na hora; a API não).
    await asTenant(migratorPool, auroraId, (c) =>
      c.query(`UPDATE lottery_tickets SET created_at = now() - interval '6 minutes' WHERE pule_number = $1`, [pule]),
    );
    const res = await cancel(bettor, pule);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('O prazo para cancelar esta pule (5 minutos depois da aposta) acabou.');
    expect((await bettor.http.get(`/v1/me/pules/${pule}`)).body).toMatchObject({
      cancellable: false,
      cancellableUntil: null,
      canceledAt: null,
    });
    expect(await kinds(bettor.person.id)).toEqual([{ kind: 'LOTTERY_BET', balance: -500, prizes: 0 }]);
  });

  it('pule já apurado (resultado adiantado) não é cancelado, mesmo dentro do prazo e do horário de venda', async () => {
    const bettor = await player(null);
    const pule = await buy(bettor, 500);
    await settleAll(app, 'aurora');
    // Simula o resultado adiantado: o pule continua "aberto" no relógio (venda e prazo), mas já foi apurado.
    await asTenant(migratorPool, auroraId, (c) =>
      c.query(
        `UPDATE lottery_tickets SET created_at = now(), closes_at = now() + interval '1 hour',
           draw_date = ((now() + interval '1 hour') AT TIME ZONE 'America/Sao_Paulo')::date
         WHERE pule_number = $1`,
        [pule],
      ),
    );
    const res = await cancel(bettor, pule);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DRAW_CLOSED');
    expect((await kinds(bettor.person.id)).map((e) => e.kind)).not.toContain('LOTTERY_REFUND');
  });

  it('horário de venda encerrado: 409 e nada muda', async () => {
    const bettor = await player(null);
    const pule = await buy(bettor, 500);
    // Leva o pule para uma extração que já fechou (a dona das tabelas pode; a API não).
    await asTenant(migratorPool, auroraId, (c) =>
      c.query(
        `UPDATE lottery_tickets SET draw_date = $2::date - 1,
           closes_at = (($2::date - 1) || ' 09:00:00-03')::timestamptz WHERE pule_number = $1`,
        [pule, TODAY],
      ),
    );
    const res = await cancel(bettor, pule);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DRAW_CLOSED');
    expect((await bettor.http.get(`/v1/me/pules/${pule}`)).body).toMatchObject({
      cancellable: false,
      canceledAt: null,
    });
  });

  it('pule de outro jogador, da Fazendinha ou inexistente: 404; sem sessão: 401', async () => {
    const owner = await player(null);
    const other = await player(null);
    const pule = await buy(owner, 500);
    expect((await cancel(other, pule)).status).toBe(404);
    expect((await cancel(owner, 999_999_999)).status).toBe(404);
    expect((await cancel(owner, 999_999_999_999)).status).toBe(404);
    expect((await api(app, 'aurora').post(`/v1/me/pules/${pule}/cancel`, {})).status).toBe(401);

    const bet = await owner.http.post('/v1/fazendinha/bets', {
      idempotencyKey: randomUUID(),
      drawDate: TOMORROW,
      lottery: 'LT BAHIA 10HS',
      hour: 10,
      mode: 'centena',
      stakeCents: 100,
      prizeCents: 88_000,
      numbers: [1],
    });
    expect((await cancel(owner, bet.body.bet.puleNumber)).status).toBe(404);
    // A pule do dono continua válida.
    expect((await owner.http.get(`/v1/me/pules/${pule}`)).body).toMatchObject({ cancellable: true, canceledAt: null });
  });

  it('o banco protege: a API não altera pules nem estornos, e pule cancelada não é premiada', async () => {
    const bettor = await player(null);
    const pule = await buy(bettor, 500);
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query('UPDATE lottery_tickets SET canceled_at = now() WHERE pule_number = $1', [pule]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asTenant(runtimePool, auroraId, (c) => c.query('UPDATE bet_commissions SET reversed_cents = 0')),
    ).rejects.toMatchObject({ code: '42501' });

    expect((await cancel(bettor, pule)).status).toBe(200);
    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query(
          `INSERT INTO pule_prizes (tenant_id, user_id, game, pule_number, draw_date, lottery, draw_hour, stake_cents,
             prize_cents)
           VALUES ($1, $2, 'lotteries', $3, $4, $5, $6, 500, 1000)`,
          [auroraId, bettor.person.id, pule, TOMORROW, RIO_09.name, RIO_09.hour],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
