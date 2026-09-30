import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminDraw,
  type AdminDrawsResponse,
  type LoginResponse,
  type PlaceLotteryTicketsResponse,
  type SaveDrawRequest,
  LOTTERY_GAME_PLACEMENTS,
  LOTTERY_GAMES,
  LOTTERY_PLACEMENTS,
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
const MILHAR = lotteryQuoteCents(findLotteryModality('milhar')!, defaultQuotes());
const BAHIA = { name: 'LT BAHIA 15HS', hour: 15 };
const LOTEP = { name: 'LT LOTEP 18HS', hour: 18 };
const RIO = { name: 'LT PT RIO 14HS', hour: 14 };

async function player(funds = 100_000) {
  const person = await createUser(app, 'aurora');
  await asTenant(migratorPool, auroraId, (c) =>
    c.query("SELECT wallet_manual_adjust($1, $2, 0, 0, 'fundos de teste')", [person.id, funds]),
  );
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return { person, http: api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token }) };
}

const item = (placement: string, extra: Record<string, unknown> = {}) => ({
  modality: 'milhar',
  placement,
  guesses: ['3452'],
  amountCents: 1000,
  split: 'total',
  quoteCents: MILHAR,
  ...extra,
});

const purchase = (extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  game: 'tradicional_10',
  drawDate: TOMORROW,
  draws: [BAHIA],
  items: [item('p1_10')],
  ...extra,
});

describe('colocações: contrato e banco têm a mesma lista', () => {
  it('lottery_placement_allowed confere com LOTTERY_GAME_PLACEMENTS em todas as colocações', async () => {
    const ids = [...LOTTERY_PLACEMENTS.map((p) => p.id), 'p6_9', 'p11', 'p0', 'x'];
    for (const game of LOTTERY_GAMES) {
      const { rows } = await migratorPool.query<{ id: string; allowed: boolean }>(
        'SELECT id, lottery_placement_allowed($1, id) AS allowed FROM unnest($2::text[]) AS id',
        [game, ids],
      );
      const allowed = rows.filter((r) => r.allowed).map((r) => r.id);
      expect(allowed.sort()).toEqual([...LOTTERY_GAME_PLACEMENTS[game]].sort());
    }
  });

  it('listas pedidas: 1/7 com 6 PRÊMIO (22); 1/10 até o 10º, sem 6/9 (55)', () => {
    expect(LOTTERY_GAME_PLACEMENTS.tradicional).toHaveLength(22);
    expect(LOTTERY_GAME_PLACEMENTS.tradicional).toContain('p6');
    expect(LOTTERY_GAME_PLACEMENTS.tradicional_10).toHaveLength(55);
    expect(LOTTERY_GAME_PLACEMENTS.tradicional_10).not.toContain('p6_9');
    expect(LOTTERY_GAME_PLACEMENTS.tradicional_10.slice(0, 4)).toEqual(['p1', 'p1_5', 'p1_10', 'p1_e_1_5']);
  });
});

describe('venda da Tradicional 1/10', () => {
  it('vende nos sorteios da 1/10 com colocações até o 10º; o pule grava o jogo', async () => {
    const { http } = await player();
    const res = await http.post(
      '/v1/lotteries/tickets',
      purchase({ draws: [BAHIA, LOTEP], items: [item('p1_10'), item('p8'), item('p6_10', { guesses: ['1234'] })] }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const body = res.body as PlaceLotteryTicketsResponse;
    expect(body.tickets.map((t) => [t.lottery, t.game])).toEqual([
      ['LT BAHIA 15HS', 'tradicional_10'],
      ['LT LOTEP 18HS', 'tradicional_10'],
    ]);
    // 1/10: prêmio ÷ 10; 8º prêmio: cheio; 6/10: ÷ 5.
    expect(body.tickets[0]!.items.map((i) => [i.placementLabel, i.possiblePrizeCents])).toEqual([
      ['1/10 PRÊMIO', (1000 * MILHAR) / 100 / 10],
      ['8 PRÊMIO', (1000 * MILHAR) / 100],
      ['6/10 PRÊMIO', (1000 * MILHAR) / 100 / 5],
    ]);
    const { rows } = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT DISTINCT game FROM lottery_tickets'),
    );
    expect(rows).toEqual([{ game: 'tradicional_10' }]);
  });

  it('sorteio que não é da 1/10 é recusado (e nada é gravado)', async () => {
    const { http } = await player();
    const res = await http.post('/v1/lotteries/tickets', purchase({ draws: [BAHIA, RIO] }));
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ field: 'draws.1', message: 'Loteria inexistente ou sem sorteio nesse dia.' }]);
    const { rows } = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT count(*)::int AS n FROM lottery_tickets'),
    );
    expect(rows[0]).toEqual({ n: 0 });
  });

  it('colocação de outro jogo é recusada: 1/10 e 7º prêmio não existem na 1/7', async () => {
    const { http } = await player();
    for (const placement of ['p1_10', 'p7', 'p2_8']) {
      const res = await http.post('/v1/lotteries/tickets', purchase({ game: 'tradicional', items: [item(placement)] }));
      expect(res.status).toBe(400);
      expect(res.body.details[0].field).toBe('items.0.placement');
    }
    // 6/9 ficou fora da 1/10.
    expect((await http.post('/v1/lotteries/tickets', purchase({ items: [item('p6_9')] }))).status).toBe(400);
  });

  it('1/7 ganhou o 6 PRÊMIO; sem "game" continua sendo a 1/7, também nos sorteios da Bahia', async () => {
    const { http } = await player();
    const { game: _game, ...legacy } = purchase({ items: [item('p6')] });
    const res = await http.post('/v1/lotteries/tickets', legacy);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((res.body as PlaceLotteryTicketsResponse).tickets[0]).toMatchObject({ game: 'tradicional' });
  });

  it('jogo desconhecido: 400', async () => {
    const { http } = await player();
    expect((await http.post('/v1/lotteries/tickets', purchase({ game: 'uruguaia' }))).status).toBe(400);
  });

  it('mesma chave em outro jogo não devolve a compra anterior', async () => {
    const { http } = await player();
    const first = purchase({ items: [item('p1')] });
    expect((await http.post('/v1/lotteries/tickets', first)).status).toBe(201);
    expect((await http.post('/v1/lotteries/tickets', first)).status).toBe(201);
    const other = await http.post('/v1/lotteries/tickets', { ...first, game: 'tradicional' });
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('CONFLICT');
  });
});

describe('Repetir pule na 1/10', () => {
  it('repete no mesmo jogo; em outro jogo explica qual é', async () => {
    const { http } = await player();
    const bought = await http.post('/v1/lotteries/tickets', purchase({ items: [item('p8')] }));
    const puleNumber = (bought.body as PlaceLotteryTicketsResponse).tickets[0]!.puleNumber;

    const repeat = (game?: string) =>
      http.post('/v1/lotteries/tickets/repeat', {
        idempotencyKey: randomUUID(),
        puleNumber,
        drawDate: TOMORROW,
        draws: [LOTEP],
        ...(game ? { game } : {}),
      });

    const same = await repeat('tradicional_10');
    expect(same.status, JSON.stringify(same.body)).toBe(201);
    expect((same.body as PlaceLotteryTicketsResponse).tickets[0]).toMatchObject({ game: 'tradicional_10' });

    const wrong = await repeat();
    expect(wrong.status).toBe(409);
    expect(wrong.body.message).toBe('Esta pule é da Tradicional 1/10. Escolha esse jogo para repetir.');
  });
});

describe('banco: segunda linha de defesa', () => {
  /** Pule inserido direto (sem a API), numa transação desfeita no fim: só as travas do banco valem. */
  const rawTicket = (game: string, lottery: { name: string; hour: number }) =>
    asTenant(runtimePool, auroraId, async (c) => {
      const user = (await createUser(app, 'aurora')).id;
      await c.query(
        `INSERT INTO lottery_tickets (tenant_id, user_id, purchase_key, draw_date, lottery, draw_hour, closes_at,
                                      total_cents, quote_table, game)
         VALUES ($1, $2, gen_random_uuid(), $3, $4, $5, now(), 100, 't', $6) RETURNING id`,
        [auroraId, user, TOMORROW, lottery.name, lottery.hour, game],
      );
      throw new Error('rollback');
    });

  it('pule 1/10 em sorteio que não é da 1/10: SJ002', async () => {
    await expect(rawTicket('tradicional_10', RIO)).rejects.toThrow(/draw not for sale/);
    await expect(rawTicket('tradicional_10', BAHIA)).rejects.toThrow('rollback');
    await expect(rawTicket('outro', BAHIA)).rejects.toThrow(/lottery_tickets_game/);
  });

  it('item com colocação de outro jogo: recusado pelo trigger', async () => {
    await expect(
      asTenant(runtimePool, auroraId, async (c) => {
        const user = (await createUser(app, 'aurora')).id;
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO lottery_tickets (tenant_id, user_id, purchase_key, draw_date, lottery, draw_hour, closes_at,
                                        total_cents, quote_table, game)
           VALUES ($1, $2, gen_random_uuid(), $3, $4, $5, now(), 100, 't', 'tradicional') RETURNING id`,
          [auroraId, user, TOMORROW, BAHIA.name, BAHIA.hour],
        );
        await c.query(
          `INSERT INTO lottery_ticket_items (tenant_id, ticket_id, position, modality, placement, guesses, amount_cents,
                                             split, total_cents, quote_cents, possible_prize_cents)
           VALUES ($1, $2, 1, 'milhar', 'p8', ARRAY['1234'], 100, 'total', 100, 1, 0)`,
          [auroraId, rows[0]!.id],
        );
      }),
    ).rejects.toThrow(/placement not allowed/);
  });
});

describe('cadastro de sorteios', () => {
  const findDraw = (res: AdminDrawsResponse, name: string) => res.draws.find((d) => d.name === name)!;
  const toSave = ({ id: _id, hour: _hour, ...draw }: AdminDraw, patch: Partial<SaveDrawRequest>): SaveDrawRequest => ({
    ...draw,
    ...patch,
  });

  it('padrão: BAHIA e LOTECE/LOTEP valem nas duas; o resto só na 1/7', async () => {
    const session = await loginOperator(app, 'aurora');
    const list = (await session.http.get('/v1/admin/draws')).body as AdminDrawsResponse;
    expect(findDraw(list, 'LT BAHIA 15HS').games).toEqual(['lotteries', 'lotteries10', 'fazendinha']);
    expect(findDraw(list, 'LT LOTECE 16HS').games).toEqual(['lotteries', 'lotteries10', 'fazendinha']);
    expect(findDraw(list, 'LT PT RIO 14HS').games).toEqual(['lotteries', 'fazendinha']);
    expect(list.draws.filter((d) => d.games.includes('lotteries10'))).toHaveLength(20);
  });

  it('com pule 1/10 vendido, a 1/10 não pode sair do sorteio; a 1/7 pode', async () => {
    const { http } = await player();
    expect((await http.post('/v1/lotteries/tickets', purchase())).status).toBe(201);
    const session = await loginOperator(app, 'aurora');
    const draw = findDraw((await session.http.get('/v1/admin/draws')).body, BAHIA.name);

    const without10 = await session.http.put(
      `/v1/admin/draws/${draw.id}`,
      toSave(draw, { games: ['lotteries', 'fazendinha'] }),
    );
    expect(without10.status).toBe(409);
    expect(without10.body.code).toBe('DRAW_HAS_BETS');

    const without7 = await session.http.put(
      `/v1/admin/draws/${draw.id}`,
      toSave(draw, { games: ['lotteries10', 'fazendinha'] }),
    );
    expect(without7.status, JSON.stringify(without7.body)).toBe(200);
    expect(findDraw(without7.body, BAHIA.name).games).toEqual(['lotteries10', 'fazendinha']);
  });

  it('o jogador vê o jogo de cada sorteio', async () => {
    const { http } = await player();
    const schedule = (await http.get('/v1/draws')).body as { draws: Array<{ name: string; games: string[] }> };
    expect(schedule.draws.find((d) => d.name === BAHIA.name)!.games).toContain('lotteries10');
    expect(schedule.draws.find((d) => d.name === RIO.name)!.games).not.toContain('lotteries10');
  });
});
