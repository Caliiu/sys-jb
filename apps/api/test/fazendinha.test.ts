import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type FazendinhaModeId,
  defaultQuotes,
  fazendinhaPrizeFrom,
  type FazendinhaSoldEntry,
  type LoginResponse,
  type PlaceFazendinhaBetResponse,
  drawDateOf,
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

type Tenant = 'aurora' | 'boreal';

// Amanhã (Brasília): toda extração do catálogo está aberta, qualquer que seja a hora do teste.
const TOMORROW = drawDateOf(new Date().toISOString(), 1);

/** Cadastra, credita saldo (só a dona das tabelas consegue) e devolve um cliente HTTP logado. */
async function player(
  tenant: Tenant = 'aurora',
  funds: { balanceJb?: number; prizesJb?: number; bonusJb?: number } = {},
) {
  const person = await createUser(app, tenant);
  const login = await api(app, tenant).post('/v1/auth/login', {
    document: person.document,
    password: 'correct horse battery staple',
  });
  const { token } = login.body as LoginResponse;
  const { balanceJb = 0, prizesJb = 0, bonusJb = 0 } = funds;
  if (balanceJb || prizesJb || bonusJb) {
    const id = await tenantId(tenant);
    // Crédito pelo caminho oficial (registrado): o banco recusa carteira fora de conciliação.
    await asTenant(migratorPool, id, (c) =>
      c.query('SELECT wallet_manual_adjust($1, $2, $3, $4, $5)', [
        person.id,
        balanceJb,
        prizesJb,
        bonusJb,
        'crédito de teste',
      ]),
    );
  }
  return { person, http: api(app, tenant, KEYS[tenant], { 'X-Session-Token': token }) };
}

/** Soma das movimentações de um usuário, por bolsa. */
const ledgerOf = (userId: string) =>
  asTenant(migratorPool, auroraId, async (c) => {
    const { rows } = await c.query<{ b: string; p: string; bo: string }>(
      `SELECT COALESCE(sum(balance_jb_delta), 0) AS b, COALESCE(sum(prizes_jb_delta), 0) AS p,
              COALESCE(sum(bonus_jb_delta), 0) AS bo
       FROM wallet_entries WHERE user_id = $1`,
      [userId],
    );
    return { balanceJb: Number(rows[0]!.b), prizesJb: Number(rows[0]!.p), bonusJb: Number(rows[0]!.bo) };
  });

const bet = (extra: Record<string, unknown> = {}) => {
  const payload: Record<string, unknown> = {
    idempotencyKey: randomUUID(),
    drawDate: TOMORROW,
    lottery: 'LT PT RIO 09HS',
    hour: 9,
    mode: 'grupo',
    stakeCents: 100,
    numbers: [5, 4],
    ...extra,
  };
  // Prêmio que a tela mostraria (cotação padrão); 1 quando o valor não existe, para cair na validação dele.
  payload.prizeCents ??=
    fazendinhaPrizeFrom(defaultQuotes(), payload.mode as FazendinhaModeId, payload.stakeCents as number) || 1;
  return payload;
};

const count = (sql: string) =>
  asTenant(migratorPool, auroraId, async (c) => Number((await c.query<{ n: string }>(sql)).rows[0]!.n));

describe('POST /v1/fazendinha/bets', () => {
  it('grava o pule, debita a carteira e devolve o comprovante', async () => {
    const { person, http } = await player('aurora', { balanceJb: 700 });
    const res = await http.post('/v1/fazendinha/bets', bet());

    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as PlaceFazendinhaBetResponse;
    expect(body.bet).toEqual({
      puleNumber: expect.any(Number),
      drawDate: TOMORROW,
      lottery: 'LT PT RIO 09HS',
      hour: 9,
      mode: 'grupo',
      stakeCents: 100,
      prizeCents: 2200,
      quoteTable: '800/1/8000',
      numbers: [4, 5],
      totalCents: 200,
      createdAt: expect.any(String),
      sellerId: person.displayId,
    });
    expect(body.bet.puleNumber).toBeGreaterThanOrEqual(100_000_000);
    expect(body.wallet).toMatchObject({ balanceJb: 500, totalAvailableJb: 500 });
    expect(JSON.stringify(body)).not.toMatch(/tenantId|userId|idempotency/);

    const ledger = await asTenant(migratorPool, auroraId, (c) =>
      c.query(
        'SELECT kind, balance_jb_delta, prizes_jb_delta FROM wallet_entries WHERE user_id = $1 AND kind = $$FAZENDINHA_BET$$',
        [person.id],
      ),
    );
    expect(ledger.rows).toEqual([{ kind: 'FAZENDINHA_BET', balance_jb_delta: '-200', prizes_jb_delta: '0' }]);
  });

  it('debita primeiro o bônus, depois o saldo e por último os prêmios', async () => {
    const { http } = await player('aurora', { balanceJb: 100, prizesJb: 1000, bonusJb: 50 });
    const res = await http.post('/v1/fazendinha/bets', bet({ stakeCents: 300, numbers: [1] }));
    expect(res.status).toBe(201);
    expect(res.body.wallet).toMatchObject({ bonusJb: 0, balanceJb: 0, prizesJb: 850 });
  });

  it('saldo insuficiente: 409 e nada é gravado', async () => {
    // 100 de saldo + 50 de bônus não cobrem os 200 do pule.
    const { http } = await player('aurora', { balanceJb: 100, bonusJb: 50 });
    const res = await http.post('/v1/fazendinha/bets', bet());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
    expect(await count('SELECT count(*) AS n FROM fazendinha_bets')).toBe(0);
    expect(await count('SELECT count(*) AS n FROM fazendinha_bet_numbers')).toBe(0);
  });

  it('número já vendido: 409 com os números, sem débito; em outro valor, modalidade ou banca pode', async () => {
    const first = await player('aurora', { balanceJb: 10_000 });
    const second = await player('aurora', { balanceJb: 10_000 });
    expect((await first.http.post('/v1/fazendinha/bets', bet({ numbers: [4, 17] }))).status).toBe(201);

    const res = await second.http.post('/v1/fazendinha/bets', bet({ numbers: [3, 4, 17] }));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'NUMBERS_UNAVAILABLE', details: [{ field: 'numbers', message: '4,17' }] });
    const me = await second.http.get('/v1/me');
    expect(me.body.wallet.balanceJb).toBe(10_000);

    expect((await second.http.post('/v1/fazendinha/bets', bet({ numbers: [4], stakeCents: 300 }))).status).toBe(201);
    expect((await second.http.post('/v1/fazendinha/bets', bet({ numbers: [4], mode: 'dezena' }))).status).toBe(201);
    expect(
      (await second.http.post('/v1/fazendinha/bets', bet({ numbers: [4], lottery: 'LT PT RIO 11HS', hour: 11 })))
        .status,
    ).toBe(201);
    const foreign = await player('boreal', { balanceJb: 10_000 });
    expect((await foreign.http.post('/v1/fazendinha/bets', bet({ numbers: [4, 17] }))).status).toBe(201);
  });

  it('mesma chave repete o pule sem cobrar de novo; chave reutilizada em outra aposta é recusada', async () => {
    const { http } = await player('aurora', { balanceJb: 1000 });
    const payload = bet();
    const a = await http.post('/v1/fazendinha/bets', payload);
    const b = await http.post('/v1/fazendinha/bets', { ...payload, numbers: [4, 5] });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.bet.puleNumber).toBe(a.body.bet.puleNumber);
    expect(b.body.wallet.balanceJb).toBe(800);

    const other = await http.post('/v1/fazendinha/bets', { ...payload, numbers: [6] });
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('CONFLICT');
  });

  it('reenvio de compra já feita devolve o pule mesmo se a cotação mudou depois', async () => {
    const { http } = await player('aurora', { balanceJb: 1000 });
    const payload = bet();
    const first = await http.post('/v1/fazendinha/bets', payload);
    expect(first.status).toBe(201);
    const session = await loginOperator(app, 'aurora');
    await session.http.put('/v1/admin/quotes/fazendinha', {
      quotes: [{ mode: 'grupo', stakeCents: 100, prizeCents: 2000 }],
    });
    const retry = await http.post('/v1/fazendinha/bets', payload);
    expect(retry.status, JSON.stringify(retry.body)).toBe(201);
    expect(retry.body.bet).toMatchObject({ puleNumber: first.body.bet.puleNumber, prizeCents: 2200 });
    // Nova compra, com o prêmio antigo: recusada.
    expect((await http.post('/v1/fazendinha/bets', bet({ numbers: [9] }))).body.code).toBe('QUOTE_CHANGED');
  });

  it('cotação salva no meio da compra: a compra espera o salvamento e recusa com a cotação nova', async () => {
    const { http } = await player('aurora', { balanceJb: 1000 });
    const manager = await runtimePool.connect();
    try {
      await manager.query('BEGIN');
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [auroraId]);
      await manager.query('SELECT pg_advisory_xact_lock(7201, hashtext($1))', [auroraId]);
      await manager.query(
        `INSERT INTO fazendinha_quotes (tenant_id, mode, stake_cents, prize_cents, updated_at)
         VALUES ($1, 'GRUPO', 100, 2000, now())
         ON CONFLICT (tenant_id, mode, stake_cents) DO UPDATE SET prize_cents = EXCLUDED.prize_cents, updated_at = now()`,
        [auroraId],
      );
      // .then() dispara a requisição já (o supertest só envia quando alguém espera por ela).
      const buying = http.post('/v1/fazendinha/bets', bet()).then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await manager.query('COMMIT');
      const res = await buying;
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.code).toBe('QUOTE_CHANGED');
      expect(await count('SELECT count(*) AS n FROM fazendinha_bets')).toBe(0);
    } finally {
      manager.release();
    }
  });

  it('compras simultâneas do mesmo número: só uma leva', async () => {
    const buyers = await Promise.all([1, 2, 3, 4].map(() => player('aurora', { balanceJb: 1000 })));
    const results = await Promise.all(
      buyers.map(({ http }) => http.post('/v1/fazendinha/bets', bet({ numbers: [9] }))),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    expect(await count('SELECT count(*) AS n FROM wallet_entries WHERE kind = $$FAZENDINHA_BET$$')).toBe(1);
  });

  it('compras simultâneas do mesmo jogador não gastam o mesmo saldo duas vezes', async () => {
    const { http } = await player('aurora', { balanceJb: 500 });
    // 5 compras de R$ 2,00 (chaves e números diferentes) com R$ 5,00: só 2 cabem no saldo.
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => http.post('/v1/fazendinha/bets', bet({ numbers: [n, n + 10] }))),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 409, 409, 409]);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.code === 'INSUFFICIENT_FUNDS')).toBe(true);
    const me = await http.get('/v1/me');
    expect(me.body.wallet.balanceJb).toBe(100);
    expect(await count('SELECT count(*) AS n FROM fazendinha_bets')).toBe(2);
  });

  it('cliques simultâneos com a mesma chave: um pule e um débito', async () => {
    const { http } = await player('aurora', { balanceJb: 1000 });
    const payload = bet();
    const results = await Promise.all([1, 2, 3].map(() => http.post('/v1/fazendinha/bets', payload)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.bet.puleNumber)).size).toBe(1);
    expect(await count('SELECT count(*) AS n FROM wallet_entries WHERE kind = $$FAZENDINHA_BET$$')).toBe(1);
  });

  it('valida catálogo, faixa dos palpites e janela de datas', async () => {
    const { http } = await player('aurora', { balanceJb: 100_000 });
    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ lottery: 'INEXISTENTE' }, 400, 'lottery'],
      [{ hour: 10 }, 400, 'lottery'],
      [{ stakeCents: 150 }, 400, 'stakeCents'],
      [{ numbers: [0] }, 400, 'numbers'],
      [{ numbers: [26] }, 400, 'numbers'],
      [{ mode: 'dezena', numbers: [100] }, 400, 'numbers'],
      [{ numbers: [1, 1] }, 400, 'numbers'],
      [{ numbers: [] }, 400, 'numbers'],
      [{ drawDate: '2026-02-30' }, 400, 'drawDate'],
      [{ idempotencyKey: 'x' }, 400, 'idempotencyKey'],
      [{ extra: true }, 400, 'extra'],
    ];
    for (const [patch, status, field] of cases) {
      const res = await http.post('/v1/fazendinha/bets', bet(patch));
      expect(res.status, JSON.stringify(patch)).toBe(status);
      expect(res.body.details?.[0]?.field, JSON.stringify(patch)).toBe(field);
    }

    // Ontem e além da janela de 6 dias. (Hoje depende da hora em que o teste roda: coberto no teste de isDrawOpen.)
    const closed = [
      { drawDate: drawDateOf(new Date().toISOString(), -1) },
      { drawDate: drawDateOf(new Date().toISOString(), 7) },
    ];
    for (const patch of closed) {
      const res = await http.post('/v1/fazendinha/bets', bet(patch));
      expect(res.status, JSON.stringify(patch)).toBe(409);
      expect(res.body.code).toBe('DRAW_CLOSED');
    }
    expect(await count('SELECT count(*) AS n FROM fazendinha_bets')).toBe(0);
  });

  it('exige sessão e credencial da banca', async () => {
    expect((await api(app, 'aurora').post('/v1/fazendinha/bets', bet())).status).toBe(401);
    const { http } = await player('aurora', { balanceJb: 1000 });
    const res = await api(app, 'aurora', 'x'.repeat(40))
      .post('/v1/fazendinha/bets', bet())
      .set('X-Session-Token', 'y'.repeat(43));
    expect(res.status).toBe(401);
    expect(http).toBeDefined();
  });
});

describe('GET /v1/fazendinha/sold', () => {
  it('lista só os números vendidos na banca, agrupados, sem dados de quem comprou', async () => {
    const a = await player('aurora', { balanceJb: 10_000 });
    const b = await player('aurora', { balanceJb: 10_000 });
    await a.http.post('/v1/fazendinha/bets', bet({ numbers: [7, 2] }));
    await b.http.post('/v1/fazendinha/bets', bet({ numbers: [3] }));
    await b.http.post(
      '/v1/fazendinha/bets',
      bet({ mode: 'centena', numbers: [413], lottery: 'LT PT RIO 11HS', hour: 11 }),
    );
    const foreign = await player('boreal', { balanceJb: 10_000 });
    await foreign.http.post('/v1/fazendinha/bets', bet({ numbers: [20] }));

    const res = await a.http.get(`/v1/fazendinha/sold?drawDate=${TOMORROW}`);
    expect(res.status).toBe(200);
    expect(res.body as FazendinhaSoldEntry[]).toEqual([
      { lottery: 'LT PT RIO 09HS', hour: 9, mode: 'grupo', stakeCents: 100, numbers: [2, 3, 7] },
      { lottery: 'LT PT RIO 11HS', hour: 11, mode: 'centena', stakeCents: 100, numbers: [413] },
    ]);

    const other = await a.http.get(`/v1/fazendinha/sold?drawDate=${drawDateOf(new Date().toISOString(), 2)}`);
    expect(other.body).toEqual([]);
    expect((await a.http.get('/v1/fazendinha/sold?drawDate=ontem')).status).toBe(400);
    expect((await a.http.get('/v1/fazendinha/sold')).status).toBe(400);
  });
});

describe('travas do banco (role de runtime)', () => {
  it('não altera saldo, não grava movimentação e não cria pule sem débito', async () => {
    const { person } = await player('aurora', { balanceJb: 1000 });
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query('UPDATE wallets SET balance_jb = 1 WHERE user_id = $1', [person.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query(
          `INSERT INTO wallet_entries (tenant_id, user_id, kind, balance_jb_delta, prizes_jb_delta)
           VALUES ($1, $2, 'FAZENDINHA_BET', 0, 0)`,
          [auroraId, person.id],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });

    // Pule + números sem chamar fazendinha_debit: o trigger adiado recusa o COMMIT.
    await expect(
      asTenant(runtimePool, auroraId, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO fazendinha_bets (tenant_id, user_id, idempotency_key, draw_date, lottery, draw_hour, mode,
             stake_cents, prize_cents, multiplier, total_cents)
           VALUES ($1, $2, gen_random_uuid(), $3, 'LT PT RIO 09HS', 9, 'GRUPO', 100, 2200, 22, 100) RETURNING id`,
          [auroraId, person.id, TOMORROW],
        );
        await c.query(
          `INSERT INTO fazendinha_bet_numbers (tenant_id, bet_id, draw_date, lottery, draw_hour, mode, stake_cents, number)
           VALUES ($1, $2, $3, 'LT PT RIO 09HS', 9, 'GRUPO', 100, 1)`,
          [auroraId, rows[0]!.id, TOMORROW],
        );
      }),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await count('SELECT count(*) AS n FROM fazendinha_bets')).toBe(0);
  });

  it('não debita duas vezes o mesmo pule, nem cobra total diferente dos números, nem mexe em pule fechado', async () => {
    const { person, http } = await player('aurora', { balanceJb: 1000 });
    const res = await http.post('/v1/fazendinha/bets', bet());
    const { rows } = await asTenant(migratorPool, auroraId, (c) =>
      c.query<{ id: string }>('SELECT id FROM fazendinha_bets WHERE user_id = $1', [person.id]),
    );
    const betId = rows[0]!.id;
    expect(res.status).toBe(201);

    await expect(
      asTenant(runtimePool, auroraId, (c) => c.query('SELECT fazendinha_debit($1::uuid)', [betId])),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query(
          `INSERT INTO fazendinha_bet_numbers (tenant_id, bet_id, draw_date, lottery, draw_hour, mode, stake_cents, number)
           VALUES ($1, $2, $3, 'LT PT RIO 09HS', 9, 'GRUPO', 100, 9)`,
          [auroraId, betId, TOMORROW],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      asTenant(runtimePool, auroraId, (c) => c.query('UPDATE fazendinha_bets SET total_cents = 1')),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(asTenant(runtimePool, auroraId, (c) => c.query('DELETE FROM fazendinha_bets'))).rejects.toMatchObject({
      code: '42501',
    });

    // Total diferente de valor × números: a função recusa o débito (e o pule nunca é gravado).
    await expect(
      asTenant(runtimePool, auroraId, async (c) => {
        const inserted = await c.query<{ id: string }>(
          `INSERT INTO fazendinha_bets (tenant_id, user_id, idempotency_key, draw_date, lottery, draw_hour, mode,
             stake_cents, prize_cents, multiplier, total_cents)
           VALUES ($1, $2, gen_random_uuid(), $3, 'LT PT RIO 11HS', 11, 'GRUPO', 100, 2200, 22, 50) RETURNING id`,
          [auroraId, person.id, TOMORROW],
        );
        await c.query(
          `INSERT INTO fazendinha_bet_numbers (tenant_id, bet_id, draw_date, lottery, draw_hour, mode, stake_cents, number)
           VALUES ($1, $2, $3, 'LT PT RIO 11HS', 11, 'GRUPO', 100, 1)`,
          [auroraId, inserted.rows[0]!.id, TOMORROW],
        );
        await c.query('SELECT fazendinha_debit($1::uuid)', [inserted.rows[0]!.id]);
      }),
    ).rejects.toMatchObject({ code: '23514' });

    const me = await http.get('/v1/me');
    expect(me.body.wallet.balanceJb).toBe(800);
  });

  it('sem contexto de banca, a função não debita nada', async () => {
    await expect(runtimePool.query('SELECT fazendinha_debit(gen_random_uuid())')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('recusa pule fora do cadastro, fechado ou além da janela, mesmo sem passar pela API', async () => {
    const { person } = await player('aurora', { balanceJb: 1000 });
    const insertBet = (drawDate: string, lottery: string, hour: number) =>
      asTenant(runtimePool, auroraId, (c) =>
        c.query(
          `INSERT INTO fazendinha_bets (tenant_id, user_id, idempotency_key, draw_date, lottery, draw_hour, mode,
             stake_cents, prize_cents, multiplier, total_cents)
           VALUES ($1, $2, gen_random_uuid(), $3, $4, $5, 'GRUPO', 100, 2200, 22, 100)`,
          [auroraId, person.id, drawDate, lottery, hour],
        ),
      );
    const now = new Date().toISOString();
    const tomorrow = drawDateOf(now, 1);
    // Ontem; 7 dias à frente; sorteio inexistente; hora diferente da do cadastro.
    await expect(insertBet(drawDateOf(now, -1), 'LT PT RIO 21HS', 21)).rejects.toMatchObject({ code: 'SJ002' });
    await expect(insertBet(drawDateOf(now, 7), 'LT PT RIO 09HS', 9)).rejects.toMatchObject({ code: 'SJ002' });
    await expect(insertBet(tomorrow, 'LOTTO TRIVO', 9)).rejects.toMatchObject({ code: 'SJ002' });
    await expect(insertBet(tomorrow, 'LT PT RIO 09HS', 10)).rejects.toMatchObject({ code: 'SJ002' });
    // Sorteio desligado para a Fazendinha.
    await asTenant(migratorPool, auroraId, (c) =>
      c.query("UPDATE draws SET fazendinha = false WHERE name = 'LT PT RIO 09HS'"),
    );
    await expect(insertBet(tomorrow, 'LT PT RIO 09HS', 9)).rejects.toMatchObject({ code: 'SJ002' });
  });
});

describe('carteira conciliada com as movimentações', () => {
  it('saldo sempre igual à soma das movimentações, depois de crédito e compras', async () => {
    const { person, http } = await player('aurora', { balanceJb: 300, prizesJb: 1000, bonusJb: 100 });
    await http.post('/v1/fazendinha/bets', bet({ stakeCents: 500, numbers: [1] }));
    const me = await http.get('/v1/me');
    expect(me.body.wallet).toMatchObject({ balanceJb: 0, prizesJb: 900, bonusJb: 0 });
    expect(await ledgerOf(person.id)).toEqual({ balanceJb: 0, prizesJb: 900, bonusJb: 0 });
  });

  it('mudar saldo sem registrar movimentação é recusado, até para a dona das tabelas', async () => {
    const { person } = await player('aurora', { balanceJb: 1000 });
    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query('UPDATE wallets SET balance_jb = balance_jb + 1 WHERE user_id = $1', [person.id]),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query('UPDATE wallets SET balance_games = 1 WHERE user_id = $1', [person.id]),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('movimentações são somente inclusão; ajuste manual exige motivo, não negativa e é proibido à API', async () => {
    const { person } = await player('aurora', { balanceJb: 1000 });
    await expect(
      asTenant(migratorPool, auroraId, (c) => c.query('UPDATE wallet_entries SET balance_jb_delta = 5')),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(asTenant(migratorPool, auroraId, (c) => c.query('DELETE FROM wallet_entries'))).rejects.toMatchObject({
      code: '23514',
    });

    const adjust = (pool: typeof migratorPool, amount: number, note: string) =>
      asTenant(pool, auroraId, (c) =>
        c.query('SELECT wallet_manual_adjust($1, $2, 0, 0, $3)', [person.id, amount, note]),
      );
    await expect(adjust(migratorPool, 100, '  ')).rejects.toMatchObject({ code: '23514' });
    await expect(adjust(migratorPool, -5000, 'estorno maior que o saldo')).rejects.toMatchObject({ code: '23514' });
    await expect(adjust(runtimePool, 100, 'tentativa pela API')).rejects.toMatchObject({ code: '42501' });

    await adjust(migratorPool, -250, 'estorno de teste');
    expect(await ledgerOf(person.id)).toEqual({ balanceJb: 750, prizesJb: 0, bonusJb: 0 });
    const { rows } = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT kind, note FROM wallet_entries WHERE user_id = $1 ORDER BY created_at', [person.id]),
    );
    expect(rows).toEqual([
      { kind: 'MANUAL_ADJUSTMENT', note: 'crédito de teste' },
      { kind: 'MANUAL_ADJUSTMENT', note: 'estorno de teste' },
    ]);
  });
});
