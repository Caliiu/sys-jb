import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type LoginResponse,
  type PlaceLotteryTicketsResponse,
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

const TOMORROW = drawDateOf(new Date().toISOString(), 1);
const IN_TWO_DAYS = drawDateOf(new Date().toISOString(), 2);
const quote = (modality: string) => lotteryQuoteCents(findLotteryModality(modality)!, defaultQuotes());

async function player(tenant: 'aurora' | 'boreal', funds: number) {
  const person = await createUser(app, tenant);
  const id = await tenantId(tenant);
  if (funds) {
    await asTenant(migratorPool, id, (c) =>
      c.query("SELECT wallet_manual_adjust($1, $2, 0, 0, 'fundos de teste')", [person.id, funds]),
    );
  }
  const login = await api(app, tenant).post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return { person, http: api(app, tenant, KEYS[tenant], { 'X-Session-Token': (login.body as LoginResponse).token }) };
}

/** Compra original: milhar (R$ 1,00) + grupo "cada" (2 × R$ 0,50), no RIO 14HS de amanhã. */
async function buyOriginal(http: Awaited<ReturnType<typeof player>>['http'], milhar = '3232') {
  const res = await http.post('/v1/lotteries/tickets', {
    idempotencyKey: randomUUID(),
    drawDate: TOMORROW,
    draws: [{ name: 'LT PT RIO 14HS', hour: 14 }],
    items: [
      {
        modality: 'milhar',
        placement: 'p1',
        guesses: [milhar],
        amountCents: 100,
        split: 'total',
        quoteCents: quote('milhar'),
      },
      {
        modality: 'grupo',
        placement: 'p1_5',
        guesses: ['05', '25'],
        amountCents: 50,
        split: 'each',
        quoteCents: quote('grupo'),
      },
    ],
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as PlaceLotteryTicketsResponse).tickets[0]!;
}

const repeat = (puleNumber: number, extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  puleNumber,
  drawDate: IN_TWO_DAYS,
  draws: [
    { name: 'LT PT RIO 16HS', hour: 16 },
    { name: 'LT BAHIA 15HS', hour: 15 },
  ],
  ...extra,
});

const itemsOf = (ticket: PlaceLotteryTicketsResponse['tickets'][number]) =>
  ticket.items.map((i) => [i.modality, i.placement, i.guesses, i.amountCents, i.split, i.totalCents]);

describe('POST /v1/lotteries/tickets/repeat', () => {
  it('compra de novo as mesmas apostas na data e nas loterias escolhidas, e debita', async () => {
    const { http } = await player('aurora', 10_000);
    const original = await buyOriginal(http);

    const res = await http.post('/v1/lotteries/tickets/repeat', repeat(original.puleNumber));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as PlaceLotteryTicketsResponse;
    expect(body.tickets.map((t) => [t.lottery, t.drawDate])).toEqual([
      ['LT PT RIO 16HS', IN_TWO_DAYS],
      ['LT BAHIA 15HS', IN_TWO_DAYS],
    ]);
    for (const ticket of body.tickets) {
      expect(ticket.puleNumber).not.toBe(original.puleNumber);
      expect(itemsOf(ticket)).toEqual(itemsOf(original));
    }
    // Original R$ 2,00 + repetição em 2 loterias (2 × R$ 2,00).
    expect(body.totalCents).toBe(400);
    expect(body.wallet.balanceJb).toBe(10_000 - 200 - 400);
  });

  it('pule antiga de combo com a colocação de antes (Passe 1/2) repete com a colocação atual da modalidade', async () => {
    const { http } = await player('aurora', 10_000);
    const bought = await http.post('/v1/lotteries/tickets', {
      idempotencyKey: randomUUID(),
      drawDate: TOMORROW,
      draws: [{ name: 'LT PT RIO 14HS', hour: 14 }],
      items: [
        {
          modality: 'passe_vai',
          placement: 'p1_5',
          guesses: ['0512'],
          amountCents: 100,
          split: 'total',
          quoteCents: quote('passe_vai'),
        },
      ],
    });
    expect(bought.status, JSON.stringify(bought.body)).toBe(201);
    const original = (bought.body as PlaceLotteryTicketsResponse).tickets[0]!;
    // Como as pules vendidas antes da mudança (só a dona das tabelas consegue alterar).
    await asTenant(migratorPool, auroraId, (c) => c.query("UPDATE lottery_ticket_items SET placement = 'p1_2'"));

    const res = await http.post('/v1/lotteries/tickets/repeat', repeat(original.puleNumber));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    for (const ticket of (res.body as PlaceLotteryTicketsResponse).tickets) {
      expect(ticket.items.map((i) => [i.modality, i.placement, i.placementLabel])).toEqual([
        ['passe_vai', 'p1_5', '1/5 PRÊMIO'],
      ]);
    }
  });

  it('mesma chave não compra de novo (clique duplo, reenvio)', async () => {
    const { http } = await player('aurora', 10_000);
    const original = await buyOriginal(http);
    const body = repeat(original.puleNumber);
    const [a, b] = await Promise.all([
      http.post('/v1/lotteries/tickets/repeat', body),
      http.post('/v1/lotteries/tickets/repeat', body),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect((a.body as PlaceLotteryTicketsResponse).tickets.map((t) => t.puleNumber)).toEqual(
      (b.body as PlaceLotteryTicketsResponse).tickets.map((t) => t.puleNumber),
    );
    const again = await http.post('/v1/lotteries/tickets/repeat', body);
    expect((again.body as PlaceLotteryTicketsResponse).wallet.balanceJb).toBe(10_000 - 200 - 400);
    // A mesma chave com outra pule (outras apostas) é recusada.
    const other = await buyOriginal(http, '1111');
    const conflict = await http.post('/v1/lotteries/tickets/repeat', { ...body, puleNumber: other.puleNumber });
    expect(conflict.status).toBe(409);
  });

  it('pule inexistente, de outro jogador ou de outra banca: a mesma resposta, sem cobrar', async () => {
    const owner = await player('aurora', 10_000);
    const original = await buyOriginal(owner.http);
    const intruder = await player('aurora', 10_000);
    const otherTenant = await player('boreal', 10_000);

    for (const [http, puleNumber] of [
      [intruder.http, original.puleNumber],
      [intruder.http, 999_999_999],
      [otherTenant.http, original.puleNumber],
    ] as const) {
      const res = await http.post('/v1/lotteries/tickets/repeat', repeat(puleNumber));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ statusCode: 404, code: 'NOT_FOUND', message: 'Pule inválida.' });
    }
    const wallet = (await intruder.http.get('/v1/me')).body.wallet;
    expect(wallet.balanceJb).toBe(10_000);
  });

  it('as travas da venda valem: loteria encerrada, saldo insuficiente, modalidade desligada', async () => {
    const { http } = await player('aurora', 250);
    const original = await buyOriginal(http);

    // Saldo: sobram R$ 0,50 e a repetição custa R$ 2,00.
    const poor = await http.post(
      '/v1/lotteries/tickets/repeat',
      repeat(original.puleNumber, { draws: [{ name: 'LT PT RIO 16HS', hour: 16 }] }),
    );
    expect(poor.status).toBe(409);
    expect(poor.body.code).toBe('INSUFFICIENT_FUNDS');

    // Loteria que não existe no dia/cadastro.
    const missing = await http.post(
      '/v1/lotteries/tickets/repeat',
      repeat(original.puleNumber, { draws: [{ name: 'LT INEXISTENTE 10HS', hour: 10 }] }),
    );
    expect(missing.status).toBe(400);

    // Milhar desligada na cotação da banca depois da compra original.
    await asTenant(migratorPool, auroraId, (c) =>
      c.query("INSERT INTO traditional_quotes (tenant_id, modality, prize_cents) VALUES ($1, 'milhar', 0)", [auroraId]),
    );
    const disabled = await http.post('/v1/lotteries/tickets/repeat', repeat(original.puleNumber));
    expect(disabled.status).toBe(409);
    expect(disabled.body).toMatchObject({
      code: 'CONFLICT',
      message: 'Esta pule tem uma modalidade que não está mais disponível.',
    });
  });

  it('valida o formato e exige sessão', async () => {
    const { http } = await player('aurora', 0);
    for (const body of [
      repeat(0),
      repeat(-5),
      repeat(1.5),
      repeat(2_147_483_648),
      { ...repeat(1), puleNumber: '123' },
      { ...repeat(1), items: [] },
      repeat(1, { draws: [] }),
      repeat(1, { drawDate: 'amanhã' }),
    ]) {
      expect((await http.post('/v1/lotteries/tickets/repeat', body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await api(app, 'aurora').post('/v1/lotteries/tickets/repeat', repeat(1))).status).toBe(401);
  });
});
