import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminTicketDrawOption,
  type AdminTicketList,
  type AdminTicketListItem,
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

const NOW = () => new Date().toISOString();
const TODAY = () => drawDateOf(NOW(), 0);
const TOMORROW = drawDateOf(NOW(), 1);

/** Jogador da aurora com saldo e sessão; `extra` vai para o cadastro (ex.: inviteCode). */
async function player(extra: Record<string, unknown> = {}) {
  const person = await createUser(app, 'aurora', extra);
  await asTenant(migratorPool, auroraId, (c) =>
    c.query("SELECT wallet_manual_adjust($1, 100000, 0, 0, 'fundos de teste')", [person.id]),
  );
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  const http = api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token });
  return { person, http };
}

type Http = Awaited<ReturnType<typeof player>>['http'];

/** Compra um pule de Loterias (R$ 1,00) na extração; devolve o número. */
async function buyLottery(http: Http, draw = { name: 'LT PT RIO 14HS', hour: 14 }): Promise<number> {
  const res = await http.post('/v1/lotteries/tickets', {
    idempotencyKey: randomUUID(),
    drawDate: TOMORROW,
    draws: [draw],
    items: [
      {
        modality: 'milhar',
        placement: 'p1',
        guesses: ['3452'],
        amountCents: 100,
        split: 'total',
        quoteCents: lotteryQuoteCents(findLotteryModality('milhar')!, defaultQuotes()),
      },
    ],
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.tickets[0].puleNumber as number;
}

let nextNumber = 1;
/** Compra um pule da Fazendinha (grupo, R$ 1,00) com um número ainda não vendido; devolve o número do pule. */
async function buyFazendinha(http: Http): Promise<number> {
  const res = await http.post('/v1/fazendinha/bets', {
    idempotencyKey: randomUUID(),
    drawDate: TOMORROW,
    lottery: 'LT PT RIO 09HS',
    hour: 9,
    mode: 'grupo',
    stakeCents: 100,
    prizeCents: fazendinhaPrizeFrom(defaultQuotes(), 'grupo', 100),
    numbers: [(nextNumber++ % 25) + 1],
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.bet.puleNumber as number;
}

type Session = Awaited<ReturnType<typeof loginOperator>>;
const list = async (session: Session, query: string) => {
  const res = await session.http.get(`/v1/admin/tickets?${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as AdminTicketList;
};
const numbers = (page: AdminTicketList) => page.items.map((i) => `${i.game}:${i.puleNumber}`);

describe('GET /v1/admin/tickets', () => {
  it('lista os bilhetes do dia (Loterias e Fazendinha), mais recentes primeiro, com apostador e total', async () => {
    const { person, http } = await player();
    const first = await buyLottery(http);
    const second = await buyFazendinha(http);

    const session = await loginOperator(app, 'aurora');
    const res = await session.http.get(`/v1/admin/tickets?date=${TODAY()}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const page = res.body as AdminTicketList;
    expect(page).toMatchObject({ page: 1, pageSize: 25, total: 2, totalPages: 1 });
    expect(numbers(page)).toEqual([`fazendinha:${second}`, `lotteries:${first}`]);
    expect(page.items[1]).toEqual({
      game: 'lotteries',
      puleNumber: first,
      createdAt: expect.any(String),
      drawDate: TOMORROW,
      lottery: 'LT PT RIO 14HS',
      drawCode: 'PTRIO14',
      totalCents: 100,
      player: { id: person.id, displayId: person.displayId, name: person.name },
    });
    expect(page.totalCents).toBe(page.items.reduce((sum, i) => sum + i.totalCents, 0));
    expect(JSON.stringify(page)).not.toMatch(/document|phone|guesses|tenantId/);
  });

  it('filtra pelo dia da venda (Brasília)', async () => {
    const { http } = await player();
    const old = await buyLottery(http);
    const today = await buyLottery(http, { name: 'LT BAHIA 15HS', hour: 15 });
    await asTenant(migratorPool, auroraId, (c) =>
      c.query(`UPDATE lottery_tickets SET created_at = now() - interval '1 day' WHERE pule_number = $1`, [old]),
    );
    const session = await loginOperator(app, 'aurora');
    expect(numbers(await list(session, `date=${TODAY()}`))).toEqual([`lotteries:${today}`]);
    expect(numbers(await list(session, `date=${drawDateOf(NOW(), -1)}`))).toEqual([`lotteries:${old}`]);
  });

  it('filtra por apostador, por promotor (só indicados de promotor) e por sorteio', async () => {
    const session = await loginOperator(app, 'aurora');
    const promoter = await createUser(app, 'aurora');
    const plain = await createUser(app, 'aurora');
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 1000 });

    const referred = await player({ inviteCode: String(promoter.displayId) });
    const byPlain = await player({ inviteCode: String(plain.displayId) });
    const a = await buyLottery(referred.http);
    const b = await buyFazendinha(referred.http);
    const c = await buyLottery(byPlain.http, { name: 'LT BAHIA 15HS', hour: 15 });

    const date = `date=${TODAY()}`;
    expect(numbers(await list(session, `${date}&userId=${byPlain.person.id}`))).toEqual([`lotteries:${c}`]);
    expect((await list(session, `${date}&promoterId=${promoter.id}`)).total).toBe(2);
    expect(numbers(await list(session, `${date}&promoterId=${promoter.id}`)).sort()).toEqual(
      [`fazendinha:${b}`, `lotteries:${a}`].sort(),
    );
    // Quem indicou não é promotor: não é filtro de promotor.
    expect((await list(session, `${date}&promoterId=${plain.id}`)).total).toBe(0);

    const options = (await session.http.get('/v1/admin/tickets/draw-options')).body as AdminTicketDrawOption[];
    const rio14 = options.find((o) => o.name === 'LT PT RIO 14HS')!;
    expect(rio14).toEqual({ id: expect.any(String), name: 'LT PT RIO 14HS', drawTime: '14:20' });
    expect(options.map((o) => o.drawTime)).toEqual([...options.map((o) => o.drawTime)].sort());
    expect(numbers(await list(session, `${date}&drawId=${rio14.id}`))).toEqual([`lotteries:${a}`]);
    // Sorteio que não é da banca: lista vazia.
    expect((await list(session, `${date}&drawId=${randomUUID()}`)).total).toBe(0);
  });

  it('pagina juntando os dois jogos sem repetir nem perder; o total vale para o filtro inteiro', async () => {
    const { http } = await player();
    for (let i = 0; i < 3; i += 1) {
      await buyLottery(http);
      await buyFazendinha(http);
    }
    const session = await loginOperator(app, 'aurora');
    const pages = [1, 2, 3].map((page) => list(session, `date=${TODAY()}&pageSize=2&page=${page}`));
    const results = await Promise.all(pages);
    expect(results[0]).toMatchObject({ total: 6, totalPages: 3, totalCents: 600 });
    const seen = results.flatMap(numbers);
    expect(new Set(seen).size).toBe(6);
    expect((await list(session, `date=${TODAY()}&pageSize=2&page=4`)).items).toEqual([]);
  });

  it('só bilhetes da banca do operador', async () => {
    const { http } = await player();
    await buyLottery(http);
    const boreal = await loginOperator(app, 'boreal');
    expect((await list(boreal, `date=${TODAY()}`)).total).toBe(0);
  });

  it('perfis: todos consultam; sem sessão, 401; parâmetros inválidos, 400', async () => {
    for (const role of ['MANAGER', 'FINANCE', 'SUPPORT'] as OperatorRole[]) {
      const session = await loginOperator(app, 'aurora', { role });
      expect((await session.http.get(`/v1/admin/tickets?date=${TODAY()}`)).status, role).toBe(200);
    }
    expect((await consoleApi(app).get(`/v1/admin/tickets?date=${TODAY()}`)).status).toBe(401);

    const session = await loginOperator(app, 'aurora');
    for (const query of [
      '',
      'date=2026-02-30',
      `date=${drawDateOf(NOW(), 1)}`,
      'date=1999-12-31',
      `date=${TODAY()}&userId=123`,
      `date=${TODAY()}&pageSize=101`,
      `date=${TODAY()}&extra=1`,
    ]) {
      const res = await session.http.get(`/v1/admin/tickets?${query}`);
      expect(res.status, query).toBe(400);
    }
  });
});

describe('GET /v1/admin/tickets/:number', () => {
  it('acha o bilhete nos dois jogos (cada um tem a sua numeração)', async () => {
    const { person, http } = await player();
    const lottery = await buyLottery(http);
    const bet = await buyFazendinha(http);
    // Mesmo número nos dois jogos (as sequências são independentes).
    await asTenant(migratorPool, auroraId, (c) =>
      c.query('UPDATE fazendinha_bets SET pule_number = $1 WHERE pule_number = $2', [lottery, bet]),
    );
    const session = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    const res = await session.http.get(`/v1/admin/tickets/${lottery}`);
    expect(res.status).toBe(200);
    const found = res.body as AdminTicketListItem[];
    expect(found.map((t) => t.game)).toEqual(['lotteries', 'fazendinha']);
    expect(found[1]).toMatchObject({ puleNumber: lottery, player: { id: person.id }, lottery: 'LT PT RIO 09HS' });
  });

  it('número que não existe na banca: lista vazia; inválido: 400', async () => {
    const { http } = await player();
    const number = await buyLottery(http);
    const boreal = await loginOperator(app, 'boreal');
    expect((await boreal.http.get(`/v1/admin/tickets/${number}`)).body).toEqual([]);
    for (const bad of ['0', '-1', 'abc', '1.5', '99999999999']) {
      expect((await boreal.http.get(`/v1/admin/tickets/${bad}`)).status, bad).toBe(400);
    }
  });
});
