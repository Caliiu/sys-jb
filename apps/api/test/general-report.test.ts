import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminGeneralReport,
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

async function report(session: Session, query: string): Promise<AdminGeneralReport> {
  const res = await session.http.get(`/v1/admin/reports/general?${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as AdminGeneralReport;
}
const names = (body: AdminGeneralReport) => body.items.map((row) => row.player.name);

async function player(name: string, extra: Record<string, unknown> = {}) {
  const person = await createUser(app, 'aurora', { name, ...extra });
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

/** Grupo da Fazendinha (1–25): cada número só é vendido uma vez por extração. */
async function buyFazendinha({ http }: Player, group = 7) {
  const res = await http.post('/v1/fazendinha/bets', {
    idempotencyKey: randomUUID(),
    drawDate: TOMORROW,
    lottery: 'LT PT RIO 14HS',
    hour: 14,
    mode: 'grupo',
    stakeCents: 100,
    prizeCents: fazendinhaPrizeFrom(defaultQuotes(), 'grupo', 100),
    numbers: [group],
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

describe('GET /v1/admin/reports/general', () => {
  it('exige operador com operation.read: Gerente e Financeiro veem; Suporte não', async () => {
    expect((await consoleApi(app).get(`/v1/admin/reports/general?${today}`)).status).toBe(401);
    const allowed: Record<OperatorRole, number> = { MANAGER: 200, FINANCE: 200, SUPPORT: 403 };
    for (const [role, status] of Object.entries(allowed) as Array<[OperatorRole, number]>) {
      const session = await loginOperator(app, 'aurora', { role });
      const res = await session.http.get(`/v1/admin/reports/general?${today}`);
      expect(res.status, role).toBe(status);
      if (status === 200) {
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body).toEqual({
          from: TODAY,
          to: TODAY,
          items: [],
          page: 1,
          pageSize: 25,
          total: 0,
          totalPages: 1,
        });
      }
    }
  });

  it.each([
    ['sem período', ''],
    ['fim no futuro', `from=${TODAY}&to=${TOMORROW}`],
    ['mais de 366 dias', `from=${day(-366)}&to=${TODAY}`],
    ['ordenação desconhecida', `${today}&sort=document`],
    ['ordenação com SQL', `${today}&sort=${encodeURIComponent('sales; DROP TABLE users')}`],
    ['direção inválida', `${today}&dir=up`],
    ['tipo inválido', `${today}&type=admin`],
    ['parâmetro desconhecido', `${today}&x=1`],
  ])('recusa %s (400)', async (_label, query) => {
    const session = await loginOperator(app, 'aurora');
    expect((await session.http.get(`/v1/admin/reports/general?${query}`)).status).toBe(400);
  });

  it('uma linha por usuário com movimento: vendas, prêmios, outros e os líquidos; maiores vendas primeiro', async () => {
    const session = await loginOperator(app, 'aurora');
    const ana = await player('Ana Apostadora');
    const bia = await player('Bia Jogadora');
    await player('Caio Parado');
    await credit(session, ana.person.id, 'balance', 10_000);
    await credit(session, ana.person.id, 'bonus', 500);
    await credit(session, bia.person.id, 'balance', 3_000);
    await buyLottery(ana, 300);
    await buyFazendinha(ana);
    await buyLottery(bia, 900);
    await prize(ana.person.id, 1_000);

    const body = await report(session, today);
    // Caio não teve movimento: não aparece.
    expect(names(body)).toEqual(['Bia Jogadora', 'Ana Apostadora']);
    expect(body.items[1]).toEqual({
      player: { id: ana.person.id, displayId: ana.person.displayId, name: 'Ana Apostadora' },
      type: 'player',
      salesCents: 400,
      commissionCents: 0,
      referralCommissionCents: 0,
      prizesCents: 1_000,
      otherCents: 10_500,
      netCents: -600,
      grossNetCents: -11_100,
    });

    expect(names(await report(session, `${today}&sort=name&dir=asc`))).toEqual(['Ana Apostadora', 'Bia Jogadora']);
    expect(names(await report(session, `${today}&sort=prizes`))).toEqual(['Ana Apostadora', 'Bia Jogadora']);
    expect(names(await report(session, `${today}&sort=net&dir=asc`))).toEqual(['Ana Apostadora', 'Bia Jogadora']);

    const paged = await report(session, `${today}&pageSize=1&page=2`);
    expect([names(paged), paged.total, paged.totalPages]).toEqual([['Ana Apostadora'], 2, 2]);
    expect((await report(session, `${today}&userId=${bia.person.id}`)).items.map((r) => r.salesCents)).toEqual([900]);
    // Ontem não teve nada.
    expect((await report(session, `from=${day(-1)}&to=${day(-1)}`)).total).toBe(0);
  });

  it('comissão das apostas dividida em promotor e "indique e ganhe"; promotor e indicados no filtro; tipo', async () => {
    const session = await loginOperator(app, 'aurora');
    await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 300 });
    const promoter = await createUser(app, 'aurora', { name: 'Paula Promotora' });
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 700 });
    const referred = await player('Rita Indicada', { inviteCode: promoter.inviteCode });
    const loose = await player('Lia Solta');
    await credit(session, referred.person.id, 'balance', 5_000);
    await credit(session, loose.person.id, 'balance', 5_000);
    for (let group = 1; group <= 10; group += 1) await buyFazendinha(referred, group);
    await buyLottery(loose, 200);

    // Comissão paga em cada aposta da indicada: R$ 10,00 × (3% + 7%) = R$ 1,00.

    const all = await report(session, today);
    const paula = all.items.find((row) => row.player.id === promoter.id)!;
    expect(paula).toMatchObject({
      type: 'promoter',
      salesCents: 0,
      commissionCents: 70,
      referralCommissionCents: 30,
      netCents: -100,
      grossNetCents: -100,
    });

    const network = await report(session, `${today}&promoterId=${promoter.id}`);
    expect(names(network).sort()).toEqual(['Paula Promotora', 'Rita Indicada']);
    expect(names(await report(session, `${today}&type=promoter`))).toEqual(['Paula Promotora']);
    expect(names(await report(session, `${today}&type=player`)).sort()).toEqual(['Lia Solta', 'Rita Indicada']);

    expect((await session.http.get(`/v1/admin/reports/general?${today}&promoterId=${loose.person.id}`)).status).toBe(
      404,
    );
  });

  it('outra banca não aparece', async () => {
    const session = await loginOperator(app, 'aurora');
    const other = await createUser(app, 'boreal');
    const boreal = await loginOperator(app, 'boreal');
    await credit(boreal, other.id, 'balance', 1_000);
    expect((await report(session, today)).total).toBe(0);
    expect((await report(boreal, today)).total).toBe(1);
  });
});
