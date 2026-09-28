import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type LoginResponse,
  type PlaceLotteryTicketsResponse,
  type PublicUser,
  brasiliaNow,
  defaultQuotes,
  drawDateOf,
  findLotteryModality,
  lotteryQuoteCents,
  weekdayOfDate,
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

const TOMORROW = drawDateOf(new Date().toISOString(), 1);

/** Primeira data de amanhã em diante (dentro da janela) cujo dia da semana atende à condição. */
const dayWhere = (test: (weekday: number) => boolean) => {
  for (let offset = 1; offset <= 6; offset += 1) {
    const date = drawDateOf(new Date().toISOString(), offset);
    if (test(weekdayOfDate(date))) return date;
  }
  throw new Error('sem data na janela');
};
const quote = (modality: string) => lotteryQuoteCents(findLotteryModality(modality)!, defaultQuotes());

async function player(funds: number, extra: Record<string, unknown> = {}) {
  const person = await createUser(app, 'aurora', extra);
  if (funds) {
    await asTenant(migratorPool, auroraId, (c) =>
      c.query("SELECT wallet_manual_adjust($1, $2, 0, 0, 'fundos de teste')", [person.id, funds]),
    );
  }
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return { person, http: api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token }) };
}

const item = (extra: Record<string, unknown> = {}) => {
  const payload: Record<string, unknown> = {
    modality: 'milhar',
    placement: 'p1',
    guesses: ['3452'],
    amountCents: 100,
    split: 'total',
    ...extra,
  };
  payload.quoteCents ??= quote(payload.modality as string) || 1;
  return payload;
};

const purchase = (extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  drawDate: TOMORROW,
  draws: [{ name: 'LT PT RIO 14HS', hour: 14 }],
  items: [item()],
  ...extra,
});

const count = (sql: string) =>
  asTenant(migratorPool, auroraId, async (c) => Number((await c.query<{ n: string }>(sql)).rows[0]!.n));

describe('POST /v1/lotteries/tickets', () => {
  it('um pule por extração, todos com os itens; débito do total e prêmios possíveis', async () => {
    const { person, http } = await player(10_000);
    const res = await http.post(
      '/v1/lotteries/tickets',
      purchase({
        draws: [
          { name: 'LT PT RIO 14HS', hour: 14 },
          { name: 'LT BAHIA 15HS', hour: 15 },
        ],
        items: [
          item(),
          item({ modality: 'dezena', placement: 'p1_5', guesses: ['12', '34'], amountCents: 200, split: 'total' }),
          item({ modality: 'grupo', placement: 'p1', guesses: ['05', '25'], amountCents: 100, split: 'each' }),
        ],
      }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const body = res.body as PlaceLotteryTicketsResponse;
    expect(body.tickets).toHaveLength(2);
    expect(body.totalCents).toBe(2 * (100 + 200 + 200));
    expect(body.wallet.balanceJb).toBe(10_000 - 1_000);

    const [rio] = body.tickets;
    expect(rio).toMatchObject({
      drawDate: TOMORROW,
      lottery: 'LT PT RIO 14HS',
      hour: 14,
      totalCents: 500,
      quoteTable: '800/1/8000',
      sellerId: person.displayId,
    });
    expect(rio!.puleNumber).toBeGreaterThanOrEqual(300_000_000);
    expect(rio!.items.map((i) => [i.modalityLabel, i.placementLabel, i.totalCents, i.possiblePrizeCents])).toEqual([
      ['MILHAR', '1 PRÊMIO', 100, 800_000],
      // R$ 2 ÷ 2 palpites = R$ 1 cada × 80 ÷ 5 posições = R$ 16.
      ['DEZENA', '1/5 PRÊMIO', 200, 1_600],
      // "Cada": R$ 1 por palpite × 20.
      ['GRUPO', '1 PRÊMIO', 200, 2_000],
    ]);
    expect(await count("SELECT count(*) AS n FROM wallet_entries WHERE kind = 'LOTTERY_BET'")).toBe(2);
  });

  it('faixas de colocação (1/6 … 5/6) dividem o prêmio pelas posições da faixa', async () => {
    const { http } = await player(10_000);
    const res = await http.post(
      '/v1/lotteries/tickets',
      purchase({
        items: [
          item({ placement: 'p1_6', guesses: ['3452'], amountCents: 600 }),
          item({ placement: 'p2_5', guesses: ['3452'], amountCents: 400 }),
          item({ placement: 'p5_6', guesses: ['3452'], amountCents: 200 }),
        ],
      }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(
      res.body.tickets[0].items.map((i: { placementLabel: string; possiblePrizeCents: number }) => [
        i.placementLabel,
        i.possiblePrizeCents,
      ]),
    ).toEqual([
      // R$ 6 × 8000 ÷ 6 posições.
      ['1/6 PRÊMIO', 800_000],
      // R$ 4 × 8000 ÷ 4 posições (2º ao 5º).
      ['2/5 PRÊMIO', 800_000],
      ['5/6 PRÊMIO', 800_000],
    ]);
    // Colocação inexistente continua recusada.
    const bad = await http.post('/v1/lotteries/tickets', purchase({ items: [item({ placement: 'p6_7' })] }));
    expect(bad.status).toBe(400);
  });

  it('invertida divide pelas permutações; Milhar e Centena paga as duas metades', async () => {
    const { http } = await player(100_000);
    const res = await http.post(
      '/v1/lotteries/tickets',
      purchase({
        items: [
          item({ modality: 'milhar_invertida', guesses: ['1234'], amountCents: 2400 }),
          item({ modality: 'milhar_centena', guesses: ['1234'], amountCents: 200 }),
          item({ modality: 'duque_gp', placement: 'p1_5', guesses: ['0512'], amountCents: 100 }),
        ],
      }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.tickets[0].items.map((i: { possiblePrizeCents: number }) => i.possiblePrizeCents)).toEqual([
      // R$ 24 × 8000 ÷ 24 permutações.
      800_000,
      // R$ 1 na milhar (8000) + R$ 1 na centena (800).
      880_000,
      // Duque GP R$ 1 × 180.
      18_000,
    ]);
  });

  it('saldo insuficiente: 409 e nada é gravado', async () => {
    const { http } = await player(150);
    const res = await http.post(
      '/v1/lotteries/tickets',
      purchase({
        draws: [
          { name: 'LT PT RIO 14HS', hour: 14 },
          { name: 'LT BAHIA 15HS', hour: 15 },
        ],
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
    expect(await count('SELECT count(*) AS n FROM lottery_tickets')).toBe(0);
    expect(await count('SELECT count(*) AS n FROM lottery_ticket_items')).toBe(0);
  });

  it('mesma chave repete os pules sem cobrar de novo (inclusive em cliques simultâneos)', async () => {
    const { http } = await player(10_000);
    const payload = purchase();
    const results = await Promise.all([1, 2, 3].map(() => http.post('/v1/lotteries/tickets', payload)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.tickets[0].puleNumber)).size).toBe(1);
    expect(await count('SELECT count(*) AS n FROM lottery_tickets')).toBe(1);
    const other = await http.post('/v1/lotteries/tickets', {
      ...payload,
      items: [item({ guesses: ['9999'] })],
      draws: [{ name: 'LT BAHIA 15HS', hour: 15 }],
    });
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('CONFLICT');
    // Mesma chave, mesmas loterias e mesmo total, mas outros palpites: também é outra compra.
    const sameTotal = await http.post('/v1/lotteries/tickets', { ...payload, items: [item({ guesses: ['9999'] })] });
    expect(sameTotal.status).toBe(409);
    expect(sameTotal.body.code).toBe('CONFLICT');
  });

  it('cotação salva no meio da compra: a compra espera o salvamento e recusa com a cotação nova', async () => {
    const { http } = await player(10_000);
    const manager = await runtimePool.connect();
    try {
      // Gerente salvando a cotação (mesma trava do QuotesService), ainda sem COMMIT.
      await manager.query('BEGIN');
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [auroraId]);
      await manager.query('SELECT pg_advisory_xact_lock(7201, hashtext($1))', [auroraId]);
      await manager.query(
        `INSERT INTO traditional_quotes (tenant_id, modality, prize_cents, updated_at) VALUES ($1, 'milhar', 700000, now())
         ON CONFLICT (tenant_id, modality) DO UPDATE SET prize_cents = EXCLUDED.prize_cents, updated_at = now()`,
        [auroraId],
      );
      // O jogador viu 8000 e confirma agora: a compra espera o salvamento terminar.
      // .then() dispara a requisição já (o supertest só envia quando alguém espera por ela).
      const buying = http.post('/v1/lotteries/tickets', purchase()).then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await manager.query('COMMIT');
      const res = await buying;
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.code).toBe('QUOTE_CHANGED');
      expect(await count('SELECT count(*) AS n FROM lottery_tickets')).toBe(0);
    } finally {
      manager.release();
    }
  });

  it('compra em andamento: salvar a cotação espera ela terminar', async () => {
    const { http } = await player(10_000);
    const session = await loginOperator(app, 'aurora');
    const buyer = await runtimePool.connect();
    try {
      // Compra em andamento (mesma trava compartilhada da venda), ainda sem COMMIT.
      await buyer.query('BEGIN');
      await buyer.query('SELECT pg_advisory_xact_lock_shared(7201, hashtext($1))', [auroraId]);
      let saved = false;
      const saving = session.http
        .put('/v1/admin/quotes/tradicional', { quotes: [{ modality: 'milhar', prizeCents: 700_000 }] })
        .then((res) => {
          saved = true;
          return res;
        });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(saved).toBe(false);
      await buyer.query('COMMIT');
      expect((await saving).status).toBe(200);
      const after = await http.post('/v1/lotteries/tickets', purchase());
      expect(after.body.code).toBe('QUOTE_CHANGED');
    } finally {
      buyer.release();
    }
  });

  it('reenvio de compra já feita devolve o recibo mesmo se a cotação mudou depois', async () => {
    const { http } = await player(10_000);
    const payload = purchase();
    const first = await http.post('/v1/lotteries/tickets', payload);
    expect(first.status).toBe(201);
    const session = await loginOperator(app, 'aurora');
    await session.http.put('/v1/admin/quotes/tradicional', { quotes: [{ modality: 'milhar', prizeCents: 700_000 }] });

    // Ex.: a resposta se perdeu na rede e a tela reenviou: a compra já foi feita e debitada.
    const retry = await http.post('/v1/lotteries/tickets', payload);
    expect(retry.status, JSON.stringify(retry.body)).toBe(201);
    expect(retry.body.tickets[0].puleNumber).toBe(first.body.tickets[0].puleNumber);
    expect(retry.body.tickets[0].items[0].possiblePrizeCents).toBe(800_000);
    expect(await count('SELECT count(*) AS n FROM lottery_tickets')).toBe(1);
  });

  it('valida catálogo, colocação, palpites e valores', async () => {
    const { http } = await player(100_000);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ items: [item({ modality: 'inexistente', quoteCents: 1 })] }, 'items.0.modality'],
      [{ items: [item({ modality: 'duque_gp', placement: 'p1', guesses: ['0512'] })] }, 'items.0.placement'],
      [{ items: [item({ guesses: ['123'] })] }, 'items.0.guesses'],
      [{ items: [item({ modality: 'grupo', guesses: ['26'] })] }, 'items.0.guesses'],
      [{ items: [item({ modality: 'duque_dez', placement: 'p1_5', guesses: ['1212'] })] }, 'items.0.guesses'],
      [{ items: [item({ guesses: ['1111', '1111'] })] }, 'items.0.guesses'],
      [{ items: [item({ guesses: ['1111', '2222', '3333'], amountCents: 2 })] }, 'items.0.amountCents'],
      [{ draws: [{ name: 'INEXISTENTE', hour: 9 }] }, 'draws.0'],
      [
        {
          draws: [
            { name: 'LT PT RIO 14HS', hour: 14 },
            { name: 'LT PT RIO 14HS', hour: 14 },
          ],
        },
        'draws.1',
      ],
      [{ drawDate: '2026-02-30' }, 'drawDate'],
      // A Federal só corre às quartas e domingos.
      [{ drawDate: dayWhere((w) => w !== 3 && w !== 0), draws: [{ name: 'LT FEDERAL', hour: 20 }] }, 'draws.0'],
      // Hora diferente da do cadastro.
      [{ draws: [{ name: 'LT PT RIO 14HS', hour: 15 }] }, 'draws.0'],
      [{ items: [] }, 'items'],
    ];
    for (const [patch, field] of cases) {
      const res = await http.post('/v1/lotteries/tickets', purchase(patch));
      expect(res.status, JSON.stringify(patch)).toBe(400);
      expect(res.body.details?.[0]?.field, JSON.stringify(patch)).toBe(field);
    }
    for (const drawDate of [drawDateOf(new Date().toISOString(), -1), drawDateOf(new Date().toISOString(), 7)]) {
      const res = await http.post('/v1/lotteries/tickets', purchase({ drawDate }));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DRAW_CLOSED');
    }
    expect(await count('SELECT count(*) AS n FROM lottery_tickets')).toBe(0);

    const federal = await http.post(
      '/v1/lotteries/tickets',
      purchase({ drawDate: dayWhere((w) => w === 3 || w === 0), draws: [{ name: 'LT FEDERAL', hour: 20 }] }),
    );
    expect(federal.status, JSON.stringify(federal.body)).toBe(201);
  });

  it('cotação alterada ou modalidade desligada: não vende', async () => {
    const session = await loginOperator(app, 'aurora');
    await session.http.put('/v1/admin/quotes/tradicional', {
      quotes: [
        { modality: 'milhar', prizeCents: 900_000 },
        { modality: 'unidade', prizeCents: 0 },
      ],
    });
    const { http } = await player(10_000);
    const stale = await http.post('/v1/lotteries/tickets', purchase());
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('QUOTE_CHANGED');
    const off = await http.post(
      '/v1/lotteries/tickets',
      purchase({ items: [item({ modality: 'unidade', guesses: ['7'], quoteCents: 800 })] }),
    );
    expect(off.status).toBe(400);
    const ok = await http.post('/v1/lotteries/tickets', purchase({ items: [item({ quoteCents: 900_000 })] }));
    expect(ok.status).toBe(201);
    expect(ok.body.tickets[0].items[0].possiblePrizeCents).toBe(900_000);
  });

  it('exige sessão', async () => {
    expect((await api(app, 'aurora').post('/v1/lotteries/tickets', purchase())).status).toBe(401);
  });
});

describe('travas do banco e comissões', () => {
  it('não cria pule sem débito, não altera pule e grava o horário limite do cadastro', async () => {
    const { person } = await player(10_000);
    const insert = (closesAt: string) =>
      asTenant(runtimePool, auroraId, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO lottery_tickets (tenant_id, user_id, purchase_key, draw_date, lottery, draw_hour, closes_at,
             total_cents, quote_table)
           VALUES ($1, $2, gen_random_uuid(), $3, 'LT PT RIO 14HS', 14, $4, 100, '800/1/8000') RETURNING id`,
          [auroraId, person.id, TOMORROW, closesAt],
        );
        await c.query(
          `INSERT INTO lottery_ticket_items (tenant_id, ticket_id, position, modality, placement, guesses, amount_cents,
             split, total_cents, quote_cents, possible_prize_cents)
           VALUES ($1, $2, 1, 'milhar', 'p1', '{3452}', 100, 'total', 100, 800000, 800000)`,
          [auroraId, rows[0]!.id],
        );
      });
    await expect(insert(`${TOMORROW}T14:18:00-03:00`)).rejects.toMatchObject({ code: '23514' });
    // O horário limite enviado é trocado pelo do cadastro (14:18 do dia do sorteio).
    const client = await runtimePool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [auroraId]);
      const { rows } = await client.query<{ closes_at: Date }>(
        `INSERT INTO lottery_tickets (tenant_id, user_id, purchase_key, draw_date, lottery, draw_hour, closes_at,
           total_cents, quote_table)
         VALUES ($1, $2, gen_random_uuid(), $3, 'LT PT RIO 14HS', 14, $4, 100, '800/1/8000') RETURNING closes_at`,
        [auroraId, person.id, TOMORROW, `${drawDateOf(new Date().toISOString(), 2)}T23:59:00-03:00`],
      );
      expect(rows[0]!.closes_at.toISOString()).toBe(new Date(`${TOMORROW}T14:18:00-03:00`).toISOString());
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    await expect(
      asTenant(runtimePool, auroraId, (c) => c.query('UPDATE lottery_tickets SET total_cents = 1')),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await count('SELECT count(*) AS n FROM lottery_tickets')).toBe(0);
  });

  it('o valor apostado nas loterias entra nas comissões de quem indicou', async () => {
    const session = await loginOperator(app, 'aurora');
    await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 1000 });
    const referrer: PublicUser = await createUser(app, 'aurora');
    const { http } = await player(10_000, { inviteCode: referrer.inviteCode });
    expect((await http.post('/v1/lotteries/tickets', purchase({ items: [item({ amountCents: 500 })] }))).status).toBe(
      201,
    );

    const { year, month } = brasiliaNow(new Date().toISOString());
    const current = `${year}-${String(month).padStart(2, '0')}`;
    const preview = (await session.http.get(`/v1/admin/commissions/months/${current}`)).body;
    expect(preview.rows).toEqual([
      expect.objectContaining({
        user: expect.objectContaining({ id: referrer.id }),
        wageredCents: 500,
        amountCents: 50,
      }),
    ]);
  });
});
