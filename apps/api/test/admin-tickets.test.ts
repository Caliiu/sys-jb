import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminTicketDetail,
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
import { PrizeSettlementService } from '../src/prizes/prize-settlement.service.js';
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
      canceledAt: null,
      quoteTable: defaultQuotes().tableLabel,
      prizeCents: 0,
      status: 'PENDING',
    });
    expect(page.items[0]).toMatchObject({
      game: 'fazendinha',
      quoteTable: defaultQuotes().tableLabel,
      prizeCents: 0,
      status: 'PENDING',
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

describe('situação, prêmio e detalhe (GET /v1/admin/tickets/:game/:number)', () => {
  const RIO_09 = { name: 'LT PT RIO 09HS', hour: 9 };
  const YESTERDAY = drawDateOf(NOW(), -1);
  const item = (modality: string, placement: string, guesses: string[], amountCents = 100) => ({
    modality,
    placement,
    guesses,
    amountCents,
    split: 'total' as const,
    quoteCents: lotteryQuoteCents(findLotteryModality(modality)!, defaultQuotes()),
  });
  async function buy(http: Http, items: Array<ReturnType<typeof item>>): Promise<number> {
    const res = await http.post('/v1/lotteries/tickets', {
      idempotencyKey: randomUUID(),
      drawDate: TOMORROW,
      draws: [RIO_09],
      items,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.tickets[0].puleNumber as number;
  }
  async function buyGroups(http: Http, numbers: number[]): Promise<number> {
    const res = await http.post('/v1/fazendinha/bets', {
      idempotencyKey: randomUUID(),
      drawDate: TOMORROW,
      lottery: RIO_09.name,
      hour: RIO_09.hour,
      mode: 'grupo',
      stakeCents: 100,
      prizeCents: fazendinhaPrizeFrom(defaultQuotes(), 'grupo', 100),
      numbers,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.bet.puleNumber as number;
  }
  /** Leva os pules para ontem (sorteio já corrido) e grava o resultado rj 09 com a cabeça 3452 (grupo 13). */
  async function drawYesterday(lotteries: number[], fazendinha: number[]) {
    await asTenant(migratorPool, auroraId, async (c) => {
      await c.query(
        `UPDATE lottery_tickets SET draw_date = $2::date,
           closes_at = ($2::date + time '09:00') AT TIME ZONE 'America/Sao_Paulo'
         WHERE pule_number = ANY($1::int[])`,
        [lotteries, YESTERDAY],
      );
      await c.query('UPDATE fazendinha_bets SET draw_date = $2::date WHERE pule_number = ANY($1::int[])', [
        fazendinha,
        YESTERDAY,
      ]);
    });
    await migratorPool.query(
      `INSERT INTO lottery_results (draw_date, lottery, extraction, prizes, source)
       VALUES ($1, 'rj', 9, $2, 'WEBHOOK')`,
      [YESTERDAY, ['3452', '1111', '2222', '3333', '4444']],
    );
  }
  const detail = async (session: Session, game: string, number: number) => {
    const res = await session.http.get(`/v1/admin/tickets/${game}/${number}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    return res.body as AdminTicketDetail;
  };

  it('PENDING até a apuração (com o prêmio que o resultado já dá); depois WON/LOST; CANCELED pelo cancelamento', async () => {
    const { person, http } = await player();
    const winner = await buy(http, [item('milhar', 'p1', ['3452']), item('grupo', 'p1_5', ['01'], 500)]);
    const loser = await buy(http, [item('milhar', 'p1', ['7777'])]);
    const canceled = await buy(http, [item('milhar', 'p1', ['3452'])]);
    const cancel = await http.post(`/v1/me/pules/${canceled}/cancel`, {});
    expect(cancel.status, JSON.stringify(cancel.body)).toBeLessThan(300);
    const bet = await buyGroups(http, [2, 13]);

    const session = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    // Antes do resultado: tudo pendente, sem resultado nem prêmio.
    const before = await detail(session, 'lotteries', winner);
    expect(before).toMatchObject({
      game: 'lotteries',
      puleNumber: winner,
      status: 'PENDING',
      prizeCents: 0,
      expectedPrizeCents: 0,
      settledAt: null,
      result: null,
      drawHour: 9,
      lotteryGame: 'tradicional',
      quoteTable: defaultQuotes().tableLabel,
      player: { id: person.id },
    });
    expect(before.items).toEqual([
      {
        position: 1,
        modality: 'milhar',
        modalityLabel: findLotteryModality('milhar')!.label,
        guesses: ['3452'],
        placement: 'p1',
        placementLabel: '1 PRÊMIO',
        stakeCents: 100,
        quoteCents: lotteryQuoteCents(findLotteryModality('milhar')!, defaultQuotes()),
        possiblePrizeCents: 800_000,
        isGift: false,
        prizeCents: 0,
        status: 'PENDING',
      },
      expect.objectContaining({ position: 2, modality: 'grupo', placement: 'p1_5', placementLabel: '1/5 PRÊMIO' }),
    ]);

    // Resultado chegou, ainda na carência: o detalhe mostra o prêmio a pagar; a lista continua pendente.
    await drawYesterday([winner, loser], [bet]);
    const waiting = await detail(session, 'lotteries', winner);
    expect(waiting).toMatchObject({ status: 'PENDING', prizeCents: 0, expectedPrizeCents: 800_000 });
    expect(waiting.result).toEqual({
      prizes: expect.arrayContaining(['3452']),
      revision: 1,
      receivedAt: expect.any(String),
    });
    expect(waiting.items.map((i) => [i.status, i.prizeCents])).toEqual([
      ['PENDING', 800_000],
      ['PENDING', 0],
    ]);

    await app.get(PrizeSettlementService).sweep(new Date(Date.now() + 31 * 60_000));
    const page = await list(session, `date=${TODAY()}`);
    const byNumber = Object.fromEntries(page.items.map((i) => [`${i.game}:${i.puleNumber}`, i]));
    expect(byNumber[`lotteries:${winner}`]).toMatchObject({ status: 'WON', prizeCents: 800_000 });
    expect(byNumber[`lotteries:${loser}`]).toMatchObject({ status: 'LOST', prizeCents: 0 });
    expect(byNumber[`lotteries:${canceled}`]).toMatchObject({ status: 'CANCELED', prizeCents: 0 });
    const groupPrize = fazendinhaPrizeFrom(defaultQuotes(), 'grupo', 100);
    expect(byNumber[`fazendinha:${bet}`]).toMatchObject({
      status: 'WON',
      prizeCents: groupPrize,
      quoteTable: defaultQuotes().tableLabel,
    });
    expect((await session.http.get(`/v1/admin/tickets/${winner}`)).body[0]).toMatchObject({ status: 'WON' });

    const paid = await detail(session, 'lotteries', winner);
    expect(paid).toMatchObject({
      status: 'WON',
      prizeCents: 800_000,
      expectedPrizeCents: 800_000,
      settledAt: expect.any(String),
      correctedPrizeCents: null,
    });
    expect(paid.items.map((i) => [i.status, i.prizeCents])).toEqual([
      ['WON', 800_000],
      ['LOST', 0],
    ]);
    expect((await detail(session, 'lotteries', loser)).items.map((i) => i.status)).toEqual(['LOST']);
    expect(await detail(session, 'lotteries', canceled)).toMatchObject({
      status: 'CANCELED',
      canceledAt: expect.any(String),
      settledAt: null,
      expectedPrizeCents: 0,
      items: [expect.objectContaining({ status: 'CANCELED', prizeCents: 0 })],
    });

    const farm = await detail(session, 'fazendinha', bet);
    expect(farm).toMatchObject({
      game: 'fazendinha',
      status: 'WON',
      quoteTable: defaultQuotes().tableLabel,
      lotteryGame: null,
    });
    expect(farm.items).toEqual([
      {
        position: 1,
        modality: 'grupo',
        modalityLabel: 'GRUPO',
        guesses: ['02'],
        placement: 'p1',
        placementLabel: '1 PRÊMIO',
        stakeCents: 100,
        quoteCents: null,
        possiblePrizeCents: groupPrize,
        isGift: false,
        prizeCents: 0,
        status: 'LOST',
      },
      expect.objectContaining({ position: 2, guesses: ['13'], prizeCents: groupPrize, status: 'WON' }),
    ]);
  });

  it('404 fora da banca ou no outro jogo; 400 com jogo ou número inválido; 401 sem sessão; todos os perfis', async () => {
    const { http } = await player();
    const number = await buyLottery(http);
    for (const role of ['MANAGER', 'FINANCE', 'SUPPORT'] as OperatorRole[]) {
      const session = await loginOperator(app, 'aurora', { role });
      expect((await session.http.get(`/v1/admin/tickets/lotteries/${number}`)).status, role).toBe(200);
    }
    expect((await consoleApi(app).get(`/v1/admin/tickets/lotteries/${number}`)).status).toBe(401);

    const aurora = await loginOperator(app, 'aurora');
    const missing = await aurora.http.get(`/v1/admin/tickets/fazendinha/${number}`);
    expect(missing.status).toBe(404);
    expect(JSON.stringify(missing.body)).toContain('NOT_FOUND');
    const boreal = await loginOperator(app, 'boreal');
    expect((await boreal.http.get(`/v1/admin/tickets/lotteries/${number}`)).status).toBe(404);
    for (const bad of ['casino/1', 'lotteries/0', 'lotteries/abc', 'LOTTERIES/1']) {
      expect((await aurora.http.get(`/v1/admin/tickets/${bad}`)).status, bad).toBe(400);
    }
  });
});
