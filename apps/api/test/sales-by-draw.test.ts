import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminSalesByDrawReport,
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
const tomorrow = `from=${TOMORROW}&to=${TOMORROW}`;

type Session = Awaited<ReturnType<typeof loginOperator>>;

async function report(session: Session, query: string): Promise<AdminSalesByDrawReport> {
  const res = await session.http.get(`/v1/admin/reports/sales-by-draw?${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as AdminSalesByDrawReport;
}

async function player(session: Session, extra: Record<string, unknown> = {}) {
  const person = await createUser(app, 'aurora', extra);
  await session.http.post(`/v1/admin/users/${person.id}/wallet/credits`, {
    idempotencyKey: randomUUID(),
    bucket: 'balance',
    amountCents: 10_000,
    note: 'Crédito de teste',
  });
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return { person, http: api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token }) };
}
type Player = Awaited<ReturnType<typeof player>>;

async function buyLottery({ http }: Player, draw: { name: string; hour: number }, amountCents: number) {
  const res = await http.post('/v1/lotteries/tickets', {
    idempotencyKey: randomUUID(),
    drawDate: TOMORROW,
    draws: [draw],
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

async function buyFazendinha({ http }: Player, draw: { name: string; hour: number }, group: number) {
  const res = await http.post('/v1/fazendinha/bets', {
    idempotencyKey: randomUUID(),
    drawDate: TOMORROW,
    lottery: draw.name,
    hour: draw.hour,
    mode: 'grupo',
    stakeCents: 100,
    prizeCents: fazendinhaPrizeFrom(defaultQuotes(), 'grupo', 100),
    numbers: [group],
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

let nextPule = 1;
const prize = (userId: string, draw: { name: string; hour: number }, prizeCents: number) =>
  asTenant(migratorPool, auroraId, (c) =>
    c.query(
      `INSERT INTO pule_prizes (tenant_id, user_id, game, pule_number, draw_date, lottery, draw_hour, stake_cents,
         prize_cents)
       VALUES ($1, $2, 'lotteries', $3, $4, $5, $6, 100, $7)`,
      [auroraId, userId, nextPule++, TOMORROW, draw.name, draw.hour, prizeCents],
    ),
  );

const RIO_09 = { name: 'LT PT RIO 09HS', hour: 9 };
const RIO_14 = { name: 'LT PT RIO 14HS', hour: 14 };

describe('GET /v1/admin/reports/sales-by-draw', () => {
  it('exige operador com operation.read: Gerente e Financeiro veem; Suporte não', async () => {
    expect((await consoleApi(app).get(`/v1/admin/reports/sales-by-draw?${tomorrow}`)).status).toBe(401);
    const allowed: Record<OperatorRole, number> = { MANAGER: 200, FINANCE: 200, SUPPORT: 403 };
    for (const [role, status] of Object.entries(allowed) as Array<[OperatorRole, number]>) {
      const session = await loginOperator(app, 'aurora', { role });
      const res = await session.http.get(`/v1/admin/reports/sales-by-draw?from=${TODAY}&to=${TODAY}`);
      expect(res.status, role).toBe(status);
      if (status === 200) {
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body).toEqual({
          from: TODAY,
          to: TODAY,
          rows: [],
          totals: { tickets: 0, lotteriesCents: 0, fazendinhaCents: 0, salesCents: 0, prizesCents: 0, netCents: 0 },
        });
      }
    }
  });

  it.each([
    ['sem período', ''],
    ['início depois do fim', `from=${TODAY}&to=${day(-1)}`],
    ['fim depois da janela de apostas (7 dias à frente)', `from=${TODAY}&to=${day(7)}`],
    ['mais de 366 dias', `from=${day(-366)}&to=${TODAY}`],
    ['apostador inválido', `from=${TODAY}&to=${TODAY}&userId=x`],
    ['parâmetro desconhecido', `from=${TODAY}&to=${TODAY}&sort=1`],
  ])('recusa %s (400)', async (_label, query) => {
    const session = await loginOperator(app, 'aurora');
    expect((await session.http.get(`/v1/admin/reports/sales-by-draw?${query}`)).status).toBe(400);
  });

  it('agrupa Loterias e Fazendinha por extração, pela data do jogo, na ordem do horário, com os prêmios', async () => {
    const session = await loginOperator(app, 'aurora');
    const ana = await player(session);
    const bia = await player(session);
    await buyLottery(ana, RIO_14, 300);
    await buyLottery(bia, RIO_14, 200);
    await buyFazendinha(ana, RIO_14, 1);
    await buyLottery(ana, RIO_09, 500);
    await prize(bia.person.id, RIO_14, 2_000);

    // As vendas são para amanhã (data do jogo): hoje não tem nada.
    expect((await report(session, `from=${TODAY}&to=${TODAY}`)).rows).toEqual([]);

    const body = await report(session, tomorrow);
    expect(body.rows).toEqual([
      {
        lottery: 'LT PT RIO 09HS',
        hour: 9,
        drawCode: expect.any(String),
        drawTime: '09:20',
        tickets: 1,
        lotteriesCents: 500,
        fazendinhaCents: 0,
        salesCents: 500,
        prizesCents: 0,
        netCents: 500,
      },
      {
        lottery: 'LT PT RIO 14HS',
        hour: 14,
        drawCode: expect.any(String),
        drawTime: expect.stringMatching(/^14:\d{2}$/),
        tickets: 3,
        lotteriesCents: 500,
        fazendinhaCents: 100,
        salesCents: 600,
        prizesCents: 2_000,
        netCents: -1_400,
      },
    ]);
    expect(body.rows[0]!.drawCode).not.toBe('');
    expect(body.totals).toEqual({
      tickets: 4,
      lotteriesCents: 1_000,
      fazendinhaCents: 100,
      salesCents: 1_100,
      prizesCents: 2_000,
      netCents: -900,
    });

    const onlyBia = await report(session, `${tomorrow}&userId=${bia.person.id}`);
    expect(onlyBia.rows.map((r) => [r.lottery, r.tickets, r.salesCents, r.prizesCents])).toEqual([
      ['LT PT RIO 14HS', 1, 200, 2_000],
    ]);
  });

  it('com promotor: só os pules dos indicados; promotor inexistente ou jogador comum = 404', async () => {
    const session = await loginOperator(app, 'aurora');
    const promoter = await createUser(app, 'aurora');
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 1000 });
    const referred = await player(session, { inviteCode: promoter.inviteCode });
    const loose = await player(session);
    await buyLottery(referred, RIO_09, 400);
    await buyLottery(loose, RIO_09, 900);

    const body = await report(session, `${tomorrow}&promoterId=${promoter.id}`);
    expect(body.totals.salesCents).toBe(400);
    expect((await report(session, tomorrow)).totals.salesCents).toBe(1_300);
    expect(
      (await session.http.get(`/v1/admin/reports/sales-by-draw?${tomorrow}&promoterId=${loose.person.id}`)).status,
    ).toBe(404);
  });

  it('sorteio que não existe mais continua no relatório, sem horário; outra banca não aparece', async () => {
    const session = await loginOperator(app, 'aurora');
    const ana = await player(session);
    await prize(ana.person.id, { name: 'LT ANTIGA 11HS', hour: 11 }, 700);
    const body = await report(session, tomorrow);
    expect(body.rows).toEqual([
      expect.objectContaining({ lottery: 'LT ANTIGA 11HS', drawTime: null, prizesCents: 700 }),
    ]);

    const boreal = await loginOperator(app, 'boreal');
    expect((await report(boreal, tomorrow)).rows).toEqual([]);
  });
});
