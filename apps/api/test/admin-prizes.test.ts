import type { INestApplication } from '@nestjs/common';
import { type AdminPrizeList, type OperatorRole, drawDateOf } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  asTenant,
  consoleApi,
  createUser,
  loginOperator,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  tenantId,
} from './helpers.js';

let app: INestApplication;
let auroraId: string;
let borealId: string;

beforeAll(async () => {
  app = await startApp();
  [auroraId, borealId] = await Promise.all([tenantId('aurora'), tenantId('boreal')]);
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

const NOW = new Date().toISOString();
const day = (offset: number) => drawDateOf(NOW, offset);

let nextPule = 1;
/** Pule premiada como a apuração vai gravar (direto no banco: a apuração ainda não existe). */
async function prize(
  tenant: string,
  userId: string,
  values: { drawDate: string; prizeCents: number; game?: string; lottery?: string; hour?: number },
) {
  const pule = nextPule++;
  await asTenant(migratorPool, tenant, (c) =>
    c.query(
      `INSERT INTO pule_prizes (tenant_id, user_id, game, pule_number, draw_date, lottery, draw_hour, draw_code,
         stake_cents, prize_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PTRIO09', 200, $8)`,
      [
        tenant,
        userId,
        values.game ?? 'lotteries',
        pule,
        values.drawDate,
        values.lottery ?? 'LT PT RIO 09HS',
        values.hour ?? 9,
        values.prizeCents,
      ],
    ),
  );
  return pule;
}

type Session = Awaited<ReturnType<typeof loginOperator>>;
const range = (from: string, to = day(0)) => `from=${from}&to=${to}`;
async function list(session: Session, query: string): Promise<AdminPrizeList> {
  const res = await session.http.get(`/v1/admin/prizes?${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as AdminPrizeList;
}
const numbers = (body: AdminPrizeList) => body.items.map((item) => item.puleNumber);

async function drawIdOf(name: string) {
  const { rows } = await asTenant(migratorPool, auroraId, (c) =>
    c.query<{ id: string }>('SELECT id FROM draws WHERE tenant_id = $1 AND name = $2', [auroraId, name]),
  );
  return rows[0]!.id;
}

describe('GET /v1/admin/prizes', () => {
  it('exige operador; todos os perfis consultam (tickets.read); sem cache', async () => {
    expect((await consoleApi(app).get(`/v1/admin/prizes?${range(day(0))}`)).status).toBe(401);
    for (const role of ['MANAGER', 'SUPPORT', 'FINANCE'] as OperatorRole[]) {
      const session = await loginOperator(app, 'aurora', { role });
      const res = await session.http.get(`/v1/admin/prizes?${range(day(0))}`);
      expect(res.status, role).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 1,
        totalPrizeCents: 0,
        reviews: [],
        reviewsTotal: 0,
        pendingCount: 0,
      });
    }
  });

  it.each([
    ['sem período', ''],
    ['fim no futuro', range(day(0), day(1))],
    ['início depois do fim', range(day(0), day(-1))],
    ['data inexistente', range('2026-02-30')],
    ['mais de 93 dias', range(day(-93))],
    ['prêmio mínimo acima do máximo', `${range(day(0))}&minPrizeCents=500&maxPrizeCents=100`],
    ['prêmio negativo', `${range(day(0))}&minPrizeCents=-1`],
    ['prêmio quebrado', `${range(day(0))}&minPrizeCents=1.5`],
    ['UUID inválido', `${range(day(0))}&userId=abc`],
    ['parâmetro desconhecido', `${range(day(0))}&ordem=asc`],
  ])('recusa %s (400)', async (_label, query) => {
    const session = await loginOperator(app, 'aurora');
    expect((await session.http.get(`/v1/admin/prizes?${query}`)).status).toBe(400);
  });

  it('período de 93 dias é aceito', async () => {
    const session = await loginOperator(app, 'aurora');
    expect((await list(session, range(day(-92)))).total).toBe(0);
  });

  it('lista o período (data do jogo, inclusivo), maiores prêmios primeiro, com o total do filtro', async () => {
    const player = await createUser(app, 'aurora');
    const small = await prize(auroraId, player.id, { drawDate: day(-2), prizeCents: 1_000 });
    const big = await prize(auroraId, player.id, { drawDate: day(-1), prizeCents: 50_000, game: 'fazendinha' });
    const today = await prize(auroraId, player.id, { drawDate: day(0), prizeCents: 8_000 });
    await prize(auroraId, player.id, { drawDate: day(-3), prizeCents: 99_999 });
    // Outra banca não aparece.
    const other = await createUser(app, 'boreal');
    await prize(borealId, other.id, { drawDate: day(0), prizeCents: 70_000 });

    const session = await loginOperator(app, 'aurora');
    const body = await list(session, range(day(-2)));
    expect(numbers(body)).toEqual([big, today, small]);
    expect(body.total).toBe(3);
    expect(body.totalPrizeCents).toBe(59_000);
    expect(body.items[0]).toEqual({
      game: 'fazendinha',
      puleNumber: big,
      drawDate: day(-1),
      lottery: 'LT PT RIO 09HS',
      drawCode: 'PTRIO09',
      stakeCents: 200,
      prizeCents: 50_000,
      settledAt: expect.any(String),
      player: { id: player.id, displayId: player.displayId, name: player.name },
    });

    const paged = await list(session, `${range(day(-2))}&pageSize=2&page=2`);
    expect(numbers(paged)).toEqual([small]);
    expect([paged.total, paged.totalPages, paged.totalPrizeCents]).toEqual([3, 2, 59_000]);
  });

  it('filtra por apostador, extração, faixa de prêmio e promotor', async () => {
    const promoter = await createUser(app, 'aurora');
    const session = await loginOperator(app, 'aurora');
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 1000 });
    const referred = await createUser(app, 'aurora', { inviteCode: promoter.inviteCode });
    const loose = await createUser(app, 'aurora');

    const rio9 = await prize(auroraId, referred.id, { drawDate: day(0), prizeCents: 2_000 });
    const rio14 = await prize(auroraId, referred.id, {
      drawDate: day(0),
      prizeCents: 30_000,
      lottery: 'LT PT RIO 14HS',
      hour: 14,
    });
    const looseRio9 = await prize(auroraId, loose.id, { drawDate: day(0), prizeCents: 500 });

    const today = range(day(0));
    expect(numbers(await list(session, `${today}&userId=${loose.id}`))).toEqual([looseRio9]);
    expect(numbers(await list(session, `${today}&drawId=${await drawIdOf('LT PT RIO 09HS')}`))).toEqual([
      rio9,
      looseRio9,
    ]);
    expect(numbers(await list(session, `${today}&minPrizeCents=2000&maxPrizeCents=30000`))).toEqual([rio14, rio9]);
    expect(numbers(await list(session, `${today}&maxPrizeCents=1999`))).toEqual([looseRio9]);
    expect(numbers(await list(session, `${today}&promoterId=${promoter.id}`))).toEqual([rio14, rio9]);
    // Jogador comum (não promotor) como promotor: nada.
    expect((await list(session, `${today}&promoterId=${loose.id}`)).total).toBe(0);
    // Sorteio de outra banca ou inexistente: nada.
    expect((await list(session, `${today}&drawId=00000000-0000-4000-8000-000000000000`)).total).toBe(0);
  });

  it('a role de runtime só lê: não inclui, não altera nem apaga prêmio', async () => {
    const player = await createUser(app, 'aurora');
    await prize(auroraId, player.id, { drawDate: day(0), prizeCents: 1_000 });
    await expect(
      asTenant(runtimePool, auroraId, (c) => c.query('UPDATE pule_prizes SET prize_cents = 999999')),
    ).rejects.toThrow(/permission denied/);
    await expect(asTenant(runtimePool, auroraId, (c) => c.query('DELETE FROM pule_prizes'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query(
          `INSERT INTO pule_prizes (tenant_id, user_id, game, pule_number, draw_date, lottery, draw_hour, stake_cents,
             prize_cents) VALUES ($1, $2, 'lotteries', 999, CURRENT_DATE, 'X', 9, 1, 1)`,
          [auroraId, player.id],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
