import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminPlayerStatement,
  type LoginResponse,
  type OperatorRole,
  defaultQuotes,
  drawDateOf,
  fazendinhaPrizeFrom,
  findLotteryModality,
  lotteryQuoteCents,
} from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  asTenant,
  consoleApi,
  createUser,
  KEYS,
  loginOperator,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  SYNTHETIC_PASSWORD,
  tenantId,
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

const NOW = new Date().toISOString();
const day = (offset: number) => drawDateOf(NOW, offset);
const TODAY = day(0);
const TOMORROW = day(1);
const today = `from=${TODAY}&to=${TODAY}`;

type Session = Awaited<ReturnType<typeof loginOperator>>;

const statementOf = (session: Session, userId: string, query: string) =>
  session.http.get(`/v1/admin/users/${userId}/statement?${query}`);

async function statement(session: Session, userId: string, query: string): Promise<AdminPlayerStatement> {
  const res = await statementOf(session, userId, query);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as AdminPlayerStatement;
}

const credit = (session: Session, userId: string, bucket: 'balance' | 'bonus' | 'games', amountCents: number) =>
  session.http.post(`/v1/admin/users/${userId}/wallet/credits`, {
    idempotencyKey: randomUUID(),
    bucket,
    amountCents,
    note: `Crédito de ${bucket}`,
  });

async function playerHttp(document: string) {
  const login = await api(app, 'aurora').post('/v1/auth/login', { document, password: SYNTHETIC_PASSWORD });
  return api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token });
}

async function buyLottery(http: Awaited<ReturnType<typeof playerHttp>>, amountCents: number): Promise<number> {
  const res = await http.post('/v1/lotteries/tickets', {
    idempotencyKey: randomUUID(),
    drawDate: TOMORROW,
    draws: [{ name: 'LT PT RIO 14HS', hour: 14 }],
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
  return res.body.tickets[0].puleNumber as number;
}

async function buyFazendinha(http: Awaited<ReturnType<typeof playerHttp>>): Promise<number> {
  const res = await http.post('/v1/fazendinha/bets', {
    idempotencyKey: randomUUID(),
    drawDate: TOMORROW,
    lottery: 'LT PT RIO 14HS',
    hour: 14,
    mode: 'grupo',
    stakeCents: 100,
    prizeCents: fazendinhaPrizeFrom(defaultQuotes(), 'grupo', 100),
    numbers: [7],
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.bet.puleNumber as number;
}

describe('GET /v1/admin/users/:id/statement', () => {
  it('exige operador; todos os perfis consultam (users.read); sem cache', async () => {
    const person = await createUser(app, 'aurora');
    expect((await consoleApi(app).get(`/v1/admin/users/${person.id}/statement?${today}`)).status).toBe(401);
    for (const role of ['MANAGER', 'SUPPORT', 'FINANCE'] as OperatorRole[]) {
      const session = await loginOperator(app, 'aurora', { role });
      const res = await statementOf(session, person.id, today);
      expect(res.status, role).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('apostador de outra banca, inexistente ou id inválido; período inválido', async () => {
    const session = await loginOperator(app, 'aurora');
    const other = await createUser(app, 'boreal');
    expect((await statementOf(session, other.id, today)).status).toBe(404);
    expect((await statementOf(session, '00000000-0000-4000-8000-000000000000', today)).status).toBe(404);
    expect((await statementOf(session, 'abc', today)).status).toBe(400);
    const person = await createUser(app, 'aurora');
    for (const query of ['', `from=${TODAY}&to=${TOMORROW}`, `from=${day(-366)}&to=${TODAY}`, `${today}&x=1`]) {
      expect((await statementOf(session, person.id, query)).status, query).toBe(400);
    }
  });

  it('lançamentos do período, mais recentes primeiro, com a carteira de apostas depois de cada um', async () => {
    const session = await loginOperator(app, 'aurora');
    const person = await createUser(app, 'aurora');
    await credit(session, person.id, 'balance', 10_000);
    await credit(session, person.id, 'bonus', 500);
    await credit(session, person.id, 'games', 2_000);
    const http = await playerHttp(person.document);
    const lotteryPule = await buyLottery(http, 300);
    const fazendinhaPule = await buyFazendinha(http);

    const body = await statement(session, person.id, today);
    expect(body).toMatchObject({
      from: TODAY,
      to: TODAY,
      player: { id: person.id, displayId: person.displayId, name: person.name },
      openingCents: 0,
      closingCents: 10_100,
      creditsCents: 10_500,
      debitsCents: -400,
      total: 5,
      totalPages: 1,
    });
    expect(
      body.items.map((e) => [e.kind, e.puleNumber, e.totalCents, e.gamesCents, e.balanceAfterCents, e.operatorName]),
    ).toEqual([
      ['FAZENDINHA_BET', fazendinhaPule, -100, 0, 10_100, null],
      ['LOTTERY_BET', lotteryPule, -300, 0, 10_200, null],
      ['OPERATOR_CREDIT', null, 0, 2_000, 10_500, session.operator.name],
      ['OPERATOR_CREDIT', null, 500, 0, 10_500, session.operator.name],
      ['OPERATOR_CREDIT', null, 10_000, 0, 10_000, session.operator.name],
    ]);
    expect(body.items[3]).toMatchObject({ bonusCents: 500, balanceCents: 0, note: 'Crédito de bonus' });

    // A paginação não muda o saldo de cada linha.
    const page2 = await statement(session, person.id, `${today}&pageSize=2&page=2`);
    expect(page2.items.map((e) => e.balanceAfterCents)).toEqual([10_500, 10_500]);
    expect([page2.total, page2.totalPages, page2.closingCents]).toEqual([5, 3, 10_100]);
  });

  it('o que veio antes do período entra no saldo inicial; período sem lançamentos mantém o saldo', async () => {
    const session = await loginOperator(app, 'aurora');
    const person = await createUser(app, 'aurora');
    // Ajuste de três dias atrás (os lançamentos são só de inclusão: entra já com a data, junto com a carteira).
    await asTenant(migratorPool, auroraId, async (c) => {
      await c.query(
        `INSERT INTO wallet_entries (tenant_id, user_id, kind, balance_jb_delta, prizes_jb_delta, note, created_at)
         VALUES ($1, $2, 'MANUAL_ADJUSTMENT', 4000, 0, 'Ajuste antigo', now() - interval '3 days')`,
        [auroraId, person.id],
      );
      await c.query('UPDATE wallets SET balance_jb = balance_jb + 4000 WHERE user_id = $1', [person.id]);
    });
    await credit(session, person.id, 'balance', 1_000);

    const body = await statement(session, person.id, today);
    expect([body.openingCents, body.closingCents, body.total]).toEqual([4_000, 5_000, 1]);
    expect(body.items[0]!.balanceAfterCents).toBe(5_000);

    const quiet = await statement(session, person.id, `from=${day(-2)}&to=${day(-1)}`);
    expect([quiet.openingCents, quiet.closingCents, quiet.items]).toEqual([4_000, 4_000, []]);
  });
});
