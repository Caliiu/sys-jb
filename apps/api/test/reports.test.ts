import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminDrawsResponse,
  type BalanceReport,
  brasiliaNow,
  defaultQuotes,
  drawDateOf,
  fazendinhaPrizeFrom,
  findLotteryModality,
  type LoginResponse,
  lotteryQuoteCents,
  type PuleDetail,
  type PuleList,
  type SaveDrawRequest,
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

const day = (offset: number) => drawDateOf(new Date().toISOString(), offset);
const TODAY = day(0);
const TOMORROW = day(1);

async function player(funds = 10_000) {
  const person = await createUser(app, 'aurora');
  if (funds) {
    await asTenant(migratorPool, auroraId, (c) =>
      c.query("SELECT wallet_manual_adjust($1, $2, 0, 0, 'motivo interno do painel')", [person.id, funds]),
    );
  }
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return { person, http: api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token }) };
}

type Http = Awaited<ReturnType<typeof player>>['http'];

/** Compra de Loterias (milhar, R$ 1,00) numa extração; devolve o número do pule. */
async function buyLottery(http: Http, drawDate: string, name: string, hour: number): Promise<number> {
  const res = await http.post('/v1/lotteries/tickets', {
    idempotencyKey: randomUUID(),
    drawDate,
    draws: [{ name, hour }],
    items: [
      {
        modality: 'milhar',
        placement: 'p1',
        guesses: ['3232'],
        amountCents: 100,
        split: 'total',
        quoteCents: lotteryQuoteCents(findLotteryModality('milhar')!, defaultQuotes()),
      },
    ],
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.tickets[0].puleNumber;
}

/** Compra da Fazendinha (grupo, R$ 1,00 por número); devolve o número do pule. */
async function buyFazendinha(http: Http, drawDate: string, lottery: string, hour: number, numbers: number[]) {
  const res = await http.post('/v1/fazendinha/bets', {
    idempotencyKey: randomUUID(),
    drawDate,
    lottery,
    hour,
    mode: 'grupo',
    stakeCents: 100,
    prizeCents: fazendinhaPrizeFrom(defaultQuotes(), 'grupo', 100),
    numbers,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.bet.puleNumber as number;
}

/** Extração que fecha às 23:59: dá para vender "hoje" a qualquer hora do dia (menos no último minuto). */
async function lateDraw(code: string): Promise<{ name: string; hour: number }> {
  const session = await loginOperator(app, 'aurora');
  const draw: SaveDrawRequest = {
    group: 'TESTE',
    name: 'LT RELATORIO 23HS',
    code,
    drawTime: '23:59',
    closesAt: '23:59',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    games: ['lotteries', 'fazendinha'],
    result: null,
    active: true,
    sortOrder: 9000,
  };
  const res = await session.http.post('/v1/admin/draws', draw);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { name: draw.name, hour: 23 };
}

const lastMinuteOfDay = () => {
  const now = brasiliaNow(new Date().toISOString());
  return now.hour === 23 && now.minute >= 58;
};

describe('GET /v1/me/reports/balance (Consultar saldo)', () => {
  it('saldo anterior, vendas, créditos pelo tipo (nunca o motivo do painel) e o haver do dia', async () => {
    const { http } = await player(10_000);
    await buyLottery(http, TOMORROW, 'LT PT RIO 14HS', 14);
    await buyFazendinha(http, TOMORROW, 'LT PT RIO 14HS', 14, [4, 5]);

    const today = await http.get(`/v1/me/reports/balance?date=${TODAY}`);
    expect(today.status).toBe(200);
    expect(today.headers['cache-control']).toBe('no-store');
    expect(today.body as BalanceReport).toEqual({
      date: TODAY,
      salesCents: 300,
      commissionCents: 0,
      prizes: [],
      entries: [{ label: 'Ajuste', amountCents: 10_000 }],
      sentCents: 0,
      receivedCents: 0,
      previousCents: 0,
      balanceCents: 9_700,
    });
    expect(JSON.stringify(today.body)).not.toContain('motivo interno');

    // Ontem não houve nada: tudo zerado.
    const yesterday = await http.get(`/v1/me/reports/balance?date=${day(-1)}`);
    expect(yesterday.body).toMatchObject({ salesCents: 0, entries: [], previousCents: 0, balanceCents: 0 });

    // A carteira fecha com o relatório.
    const me = await http.get('/v1/me');
    expect(me.body.wallet.totalAvailableJb).toBe(9_700);
  });

  it('só enxerga a própria carteira', async () => {
    const a = await player(10_000);
    const b = await player(5_000);
    await buyLottery(b.http, TOMORROW, 'LT PT RIO 14HS', 14);
    const res = await a.http.get(`/v1/me/reports/balance?date=${TODAY}`);
    expect(res.body).toMatchObject({ salesCents: 0, balanceCents: 10_000 });
  });
});

describe('GET /v1/me/pules (Consultar pule por data)', () => {
  it('pules vendidas no dia, mais recentes primeiro, com o código da extração e os totais', async () => {
    const { http } = await player();
    const lottery = await buyLottery(http, TOMORROW, 'LT PT RIO 14HS', 14);
    const fazendinha = await buyFazendinha(http, TOMORROW, 'LT BAHIA 15HS', 15, [4, 5]);
    const other = await player();
    await buyLottery(other.http, TOMORROW, 'LT PT RIO 14HS', 14);

    const res = await http.get(`/v1/me/pules?date=${TODAY}`);
    expect(res.status).toBe(200);
    const body = res.body as PuleList;
    expect(body).toMatchObject({ date: TODAY, registeredCents: 300, canceledCents: 0, truncated: false });
    expect(
      body.pules.map(({ puleNumber, game, code, drawDate, status, totalCents }) => ({
        puleNumber,
        game,
        code,
        drawDate,
        status,
        totalCents,
      })),
    ).toEqual([
      {
        puleNumber: fazendinha,
        game: 'fazendinha',
        code: 'BAHIA15',
        drawDate: TOMORROW,
        status: 'registered',
        totalCents: 200,
      },
      {
        puleNumber: lottery,
        game: 'lotteries',
        code: 'PTRIO14',
        drawDate: TOMORROW,
        status: 'registered',
        totalCents: 100,
      },
    ]);

    expect((await http.get(`/v1/me/pules?date=${day(-1)}`)).body).toMatchObject({ registeredCents: 0, pules: [] });
  });

  it('recusa data fora da janela (hoje até 6 dias atrás), malformada ou ausente', async () => {
    const { http } = await player(0);
    expect((await http.get(`/v1/me/pules?date=${day(-6)}`)).status).toBe(200);
    for (const query of [
      `date=${day(-7)}`,
      `date=${TOMORROW}`,
      'date=2026-02-30',
      'date=hoje',
      '',
      `date=${TODAY}&userId=x`,
    ]) {
      expect((await http.get(`/v1/me/pules?${query}`)).status, query).toBe(400);
    }
  });
});

describe('GET /v1/me/pules/:puleNumber (recibo)', () => {
  it('recibo da pule do jogador; de outro jogador ou inexistente responde 404', async () => {
    const { http } = await player();
    const lottery = await buyLottery(http, TOMORROW, 'LT PT RIO 14HS', 14);
    const fazendinha = await buyFazendinha(http, TOMORROW, 'LT PT RIO 14HS', 14, [4, 5]);

    const ticket = await http.get(`/v1/me/pules/${lottery}`);
    expect(ticket.status).toBe(200);
    const detail = ticket.body as PuleDetail;
    expect(detail).toMatchObject({ game: 'lotteries', cancellable: true });
    if (detail.game !== 'lotteries') throw new Error('esperava Loterias');
    expect(detail.ticket).toMatchObject({
      puleNumber: lottery,
      drawDate: TOMORROW,
      lottery: 'LT PT RIO 14HS',
      quoteTable: '800/1/8000',
      totalCents: 100,
    });
    expect(detail.ticket.items).toEqual([expect.objectContaining({ modality: 'milhar', guesses: ['3232'] })]);

    const bet = await http.get(`/v1/me/pules/${fazendinha}`);
    expect(bet.body).toMatchObject({
      game: 'fazendinha',
      bet: { puleNumber: fazendinha, numbers: [4, 5], stakeCents: 100, totalCents: 200, quoteTable: '800/1/8000' },
    });

    const other = await player(0);
    for (const pule of [lottery, fazendinha, 999_999_999]) {
      const res = await other.http.get(`/v1/me/pules/${pule}`);
      expect(res.status, String(pule)).toBe(404);
      expect(res.body).toEqual({ statusCode: 404, code: 'NOT_FOUND', message: 'Pule não encontrada.' });
    }
    for (const bad of ['0', '0123', 'abc', '1e3', '1000000000000']) {
      expect((await http.get(`/v1/me/pules/${bad}`)).status, bad).toBe(400);
    }
  });
});

describe('GET /v1/me/reports/lottery-movement (Movimento loterias)', () => {
  it.skipIf(lastMinuteOfDay())(
    'total do jogador por extração do dia (pelo "vale"), com o código gravado na venda',
    async () => {
      const draw = await lateDraw('TREL23');
      const { http } = await player();
      await buyLottery(http, TODAY, draw.name, draw.hour);
      await buyFazendinha(http, TODAY, draw.name, draw.hour, [1, 2]);
      // Vale amanhã: não entra no movimento de hoje.
      await buyLottery(http, TOMORROW, 'LT PT RIO 14HS', 14);

      const res = await http.get(`/v1/me/reports/lottery-movement?date=${TODAY}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ date: TODAY, rows: [{ code: 'TREL23', totalCents: 300 }] });

      // Mudar o código no cadastro não altera as pules já vendidas.
      const session = await loginOperator(app, 'aurora');
      const list = (await session.http.get('/v1/admin/draws')).body as AdminDrawsResponse;
      const current = list.draws.find((d) => d.name === draw.name)!;
      const { id: _id, hour: _hour, ...save } = current;
      expect((await session.http.put(`/v1/admin/draws/${current.id}`, { ...save, code: 'NOVO23' })).status).toBe(200);
      expect((await http.get(`/v1/me/reports/lottery-movement?date=${TODAY}`)).body.rows).toEqual([
        { code: 'TREL23', totalCents: 300 },
      ]);
    },
  );

  it('sem apostas no dia: lista vazia', async () => {
    const { http } = await player(0);
    expect((await http.get(`/v1/me/reports/lottery-movement?date=${day(-7)}`)).body).toEqual({
      date: day(-7),
      rows: [],
    });
    expect((await http.get(`/v1/me/reports/lottery-movement?date=${day(-8)}`)).status).toBe(400);
  });
});

describe('autenticação', () => {
  it('todas as rotas exigem a credencial da banca e a sessão do jogador', async () => {
    for (const path of [
      `/v1/me/reports/balance?date=${TODAY}`,
      `/v1/me/reports/lottery-movement?date=${TODAY}`,
      `/v1/me/pules?date=${TODAY}`,
      '/v1/me/pules/300000000',
    ]) {
      expect((await api(app, 'aurora').get(path)).status, path).toBe(401);
      const noSession = await api(app, 'aurora', KEYS.aurora).get(path);
      expect(noSession.status, path).toBe(401);
      expect(noSession.body.code).toBe('SESSION_INVALID');
    }
  });
});
