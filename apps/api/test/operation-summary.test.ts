import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminOperationSummary,
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

const NOW = new Date().toISOString();
const day = (offset: number) => drawDateOf(NOW, offset);
const TODAY = day(0);
const TOMORROW = day(1);

type Session = Awaited<ReturnType<typeof loginOperator>>;

async function summary(session: Session, query: string): Promise<AdminOperationSummary> {
  const res = await session.http.get(`/v1/admin/operation-summary?${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as AdminOperationSummary;
}
const today = `from=${TODAY}&to=${TODAY}`;

/** Jogador da aurora com sessão; `extra` vai para o cadastro (ex.: inviteCode). */
async function player(extra: Record<string, unknown> = {}) {
  const person = await createUser(app, 'aurora', extra);
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return { person, http: api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token }) };
}
type Player = Awaited<ReturnType<typeof player>>;

const credit = (session: Session, userId: string, bucket: 'balance' | 'bonus' | 'games', amountCents: number) =>
  session.http.post(`/v1/admin/users/${userId}/wallet/credits`, {
    idempotencyKey: randomUUID(),
    bucket,
    amountCents,
    note: 'Crédito de teste',
  });

async function buyLottery({ http }: Player, amountCents: number) {
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
}

async function buyFazendinha({ http }: Player) {
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
}

let nextPule = 1;
const prize = (userId: string, prizeCents: number) =>
  asTenant(migratorPool, auroraId, (c) =>
    c.query(
      `INSERT INTO pule_prizes (tenant_id, user_id, game, pule_number, draw_date, lottery, draw_hour, stake_cents,
         prize_cents)
       VALUES ($1, $2, 'lotteries', $3, CURRENT_DATE, 'LT PT RIO 14HS', 14, 100, $4)`,
      [auroraId, userId, nextPule++, prizeCents],
    ),
  );

describe('GET /v1/admin/operation-summary', () => {
  it('exige operador com operation.read: Gerente e Financeiro veem; Suporte não', async () => {
    expect((await consoleApi(app).get(`/v1/admin/operation-summary?${today}`)).status).toBe(401);
    const allowed: Record<OperatorRole, number> = { MANAGER: 200, FINANCE: 200, SUPPORT: 403 };
    for (const [role, status] of Object.entries(allowed) as Array<[OperatorRole, number]>) {
      const session = await loginOperator(app, 'aurora', { role });
      const res = await session.http.get(`/v1/admin/operation-summary?${today}`);
      expect(res.status, role).toBe(status);
      if (status === 200) expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it.each([
    ['sem período', ''],
    ['fim no futuro', `from=${TODAY}&to=${TOMORROW}`],
    ['início depois do fim', `from=${TODAY}&to=${day(-1)}`],
    ['mais de 366 dias', `from=${day(-366)}&to=${TODAY}`],
    ['data inexistente', `from=2026-02-30&to=${TODAY}`],
    ['promotor que não é UUID', `${today}&promoterId=abc`],
    ['parâmetro desconhecido', `${today}&x=1`],
  ])('recusa %s (400)', async (_label, query) => {
    const session = await loginOperator(app, 'aurora');
    expect((await session.http.get(`/v1/admin/operation-summary?${query}`)).status).toBe(400);
  });

  it('banca sem movimento: tudo zerado, com o que ainda não tem origem marcado', async () => {
    const session = await loginOperator(app, 'aurora');
    expect(await summary(session, `from=${day(-365)}&to=${TODAY}`)).toEqual({
      from: day(-365),
      to: TODAY,
      promoter: null,
      newUsers: { signups: 0, firstDeposits: 0, firstDepositRateBps: 0, firstDepositAverageCents: 0 },
      cashflow: { depositsCents: 0, withdrawalsCents: 0, netCents: 0 },
      balances: { withdrawableCents: 0, totalCents: 0, creditedCents: 0, bonusCreditedCents: 0 },
      result: { wageredCents: 0, prizesCents: 0, grossCents: 0, commissionCents: 0, netCents: 0 },
      lotteries: { turnoverCents: 0, payoutCents: 0, netCents: 0 },
      casino: { turnoverCents: 0, payoutCents: 0, netCents: 0 },
      unavailable: ['casino'],
    });
  });

  it('cadastros, créditos, jogado (Loterias + Fazendinha), prêmios e saldo total do período', async () => {
    const session = await loginOperator(app, 'aurora');
    const ana = await player();
    const bia = await player();
    expect((await credit(session, ana.person.id, 'balance', 10_000)).status).toBe(201);
    expect((await credit(session, ana.person.id, 'bonus', 500)).status).toBe(201);
    expect((await credit(session, bia.person.id, 'games', 2_000)).status).toBe(201);
    await buyLottery(ana, 300);
    await buyFazendinha(ana);
    await prize(ana.person.id, 1_000);
    // Outra banca não entra.
    await createUser(app, 'boreal');

    const body = await summary(session, today);
    expect(body.newUsers.signups).toBe(2);
    expect(body.balances).toEqual({
      withdrawableCents: 0,
      // 10.000 + 500 + 2.000 creditados, menos 400 apostados.
      totalCents: 12_100,
      creditedCents: 12_000,
      bonusCreditedCents: 500,
    });
    expect(body.result).toEqual({
      wageredCents: 400,
      prizesCents: 1_000,
      grossCents: -600,
      commissionCents: 0,
      netCents: -600,
    });
    expect(body.lotteries).toEqual({ turnoverCents: 400, payoutCents: 1_000, netCents: -600 });

    // Ontem não teve nada.
    const yesterday = await summary(session, `from=${day(-1)}&to=${day(-1)}`);
    expect([yesterday.newUsers.signups, yesterday.result.wageredCents, yesterday.balances.creditedCents]).toEqual([
      0, 0, 0,
    ]);
  });

  it('comissão paga no período (na apuração do pule) entra no resultado; com promotor, só a dele', async () => {
    const session = await loginOperator(app, 'aurora');
    await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 300 });
    const promoter = await createUser(app, 'aurora');
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 700 });
    const referred = await player({ inviteCode: promoter.inviteCode });
    await credit(session, referred.person.id, 'balance', 1_000);
    await buyFazendinha(referred);
    // Pendente até a apuração: ainda sem comissão no período.
    expect((await summary(session, today)).result.commissionCents).toBe(0);

    // 10% (3% + 7%) de R$ 1,00, creditado na apuração.
    await settleAll(app, 'aurora');
    const body = await summary(session, today);
    expect(body.result).toEqual({
      wageredCents: 100,
      prizesCents: 0,
      grossCents: 100,
      commissionCents: 10,
      netCents: 90,
    });
    expect((await summary(session, `${today}&promoterId=${promoter.id}`)).result.commissionCents).toBe(10);
    // Ontem não teve comissão.
    expect((await summary(session, `from=${day(-1)}&to=${day(-1)}`)).result.commissionCents).toBe(0);
  });

  it('com promotor: só os indicados dele; promotor inexistente ou jogador comum = 404', async () => {
    const session = await loginOperator(app, 'aurora');
    const promoter = await createUser(app, 'aurora');
    expect((await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 1000 })).status).toBe(200);
    const referred = await player({ inviteCode: promoter.inviteCode });
    const loose = await player();
    await credit(session, referred.person.id, 'balance', 5_000);
    await credit(session, loose.person.id, 'balance', 7_000);
    await buyLottery(referred, 200);
    await buyLottery(loose, 900);

    const body = await summary(session, `${today}&promoterId=${promoter.id}`);
    expect(body.promoter).toEqual({ id: promoter.id, displayId: promoter.displayId, name: promoter.name });
    expect(body.newUsers.signups).toBe(1);
    expect(body.balances.creditedCents).toBe(5_000);
    expect(body.balances.totalCents).toBe(4_800);
    expect(body.result.wageredCents).toBe(200);

    const all = await summary(session, today);
    expect(all.newUsers.signups).toBe(3);
    expect(all.result.wageredCents).toBe(1_100);

    expect((await session.http.get(`/v1/admin/operation-summary?${today}&promoterId=${loose.person.id}`)).status).toBe(
      404,
    );
    expect(
      (await session.http.get(`/v1/admin/operation-summary?${today}&promoterId=00000000-0000-4000-8000-000000000000`))
        .status,
    ).toBe(404);
  });
});
