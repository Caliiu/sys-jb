import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type AdminCasinoGeneralReport, type OperatorRole, drawDateOf } from '@sysjb/contracts';
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

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

const NOW = new Date().toISOString();
const day = (offset: number) => drawDateOf(NOW, offset);
const TODAY = day(0);
const today = `from=${TODAY}&to=${TODAY}`;
const URL = '/v1/admin/reports/casino/general';

const EMPTY: AdminCasinoGeneralReport = {
  from: TODAY,
  to: TODAY,
  rows: [],
  totals: { turnoverCents: 0, payoutCents: 0, netCents: 0 },
  available: true,
};

/** Rodada sintética do cassino (gravada direto pela credencial de migração), agora ou na hora dada. */
async function round(
  userId: string,
  betCents: number,
  winCents: number,
  { tenant = 'aurora', at = new Date().toISOString() }: { tenant?: 'aurora' | 'boreal'; at?: string } = {},
) {
  const id = await tenantId(tenant);
  await asTenant(migratorPool, id, (c) =>
    c.query(
      `INSERT INTO casino_transactions (tenant_id, user_id, txn_id, provider, game_code, txn_type, bet_cents,
         win_cents, balance_after, created_at)
       VALUES ($1, $2, $3, 'PGSOFT', 'fortune-tiger', 'debit_credit', $4, $5, 0, $6::timestamptz)`,
      [id, userId, randomUUID(), betCents, winCents, at],
    ),
  );
}

async function report(session: Awaited<ReturnType<typeof loginOperator>>, query: string) {
  const res = await session.http.get(`${URL}?${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as AdminCasinoGeneralReport;
}

describe('GET /v1/admin/reports/casino/general', () => {
  it('exige operador com operation.read: Gerente e Financeiro veem; Suporte não', async () => {
    expect((await consoleApi(app).get(`${URL}?${today}`)).status).toBe(401);
    const allowed: Record<OperatorRole, number> = { MANAGER: 200, FINANCE: 200, SUPPORT: 403 };
    for (const [role, status] of Object.entries(allowed) as Array<[OperatorRole, number]>) {
      const session = await loginOperator(app, 'aurora', { role });
      const res = await session.http.get(`${URL}?${today}`);
      expect(res.status, role).toBe(status);
      if (status === 200) {
        expect(res.headers['cache-control']).toBe('no-store');
        // Sem rodada no período: vazio.
        expect(res.body).toEqual(EMPTY);
      }
    }
  });

  it.each([
    ['sem período', ''],
    ['início depois do fim', `from=${TODAY}&to=${day(-1)}`],
    ['fim no futuro', `from=${TODAY}&to=${day(1)}`],
    ['mais de 366 dias', `from=${day(-366)}&to=${TODAY}`],
    ['data inexistente', `from=2026-02-30&to=${TODAY}`],
    ['promotor inválido', `${today}&promoterId=x`],
    ['apostador inválido', `${today}&userId=x`],
    ['tipo inválido', `${today}&type=admin`],
    ['parâmetro desconhecido', `${today}&sort=1`],
  ])('recusa %s (400)', async (_label, query) => {
    const session = await loginOperator(app, 'aurora');
    expect((await session.http.get(`${URL}?${query}`)).status).toBe(400);
  });

  it('uma linha por usuário com rodada no período (apostado − pago), maior apostado primeiro', async () => {
    const session = await loginOperator(app, 'aurora');
    const promoter = await createUser(app, 'aurora', { name: 'Paula Promotora' });
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 1000 });
    const ana = await createUser(app, 'aurora', { name: 'Ana', inviteCode: promoter.inviteCode });
    const bia = await createUser(app, 'aurora', { name: 'Bia' });
    await round(ana.id, 300, 0);
    await round(ana.id, 200, 900);
    await round(bia.id, 1_000, 100);
    await round(promoter.id, 50, 0);
    // Fora do período e de outra banca: não entram.
    await round(bia.id, 7_000, 0, { at: `${day(-1)}T12:00:00-03:00` });
    await round((await createUser(app, 'boreal')).id, 9_000, 0, { tenant: 'boreal' });

    const body = await report(session, today);
    expect(body.rows).toEqual([
      {
        player: { id: bia.id, displayId: bia.displayId, name: 'Bia' },
        type: 'player',
        turnoverCents: 1_000,
        payoutCents: 100,
        netCents: 900,
      },
      {
        player: { id: ana.id, displayId: ana.displayId, name: 'Ana' },
        type: 'player',
        turnoverCents: 500,
        payoutCents: 900,
        netCents: -400,
      },
      {
        player: { id: promoter.id, displayId: promoter.displayId, name: 'Paula Promotora' },
        type: 'promoter',
        turnoverCents: 50,
        payoutCents: 0,
        netCents: 50,
      },
    ]);
    expect(body.totals).toEqual({ turnoverCents: 1_550, payoutCents: 1_000, netCents: 550 });
    expect(body.available).toBe(true);

    // Filtros: indicados do promotor, um apostador, tipo.
    expect((await report(session, `${today}&promoterId=${promoter.id}`)).rows.map((r) => r.player.id)).toEqual([
      ana.id,
    ]);
    expect((await report(session, `${today}&userId=${bia.id}`)).totals.turnoverCents).toBe(1_000);
    expect((await report(session, `${today}&type=promoter`)).rows.map((r) => r.player.id)).toEqual([promoter.id]);
    expect((await report(session, `from=${day(-1)}&to=${TODAY}&userId=${bia.id}`)).totals.turnoverCents).toBe(8_000);
  });

  it('aceita os filtros; promotor inexistente, jogador comum ou de outra banca = 404', async () => {
    const session = await loginOperator(app, 'aurora');
    const promoter = await createUser(app, 'aurora');
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 1000 });
    const loose = await createUser(app, 'aurora');
    const boreal = await loginOperator(app, 'boreal');
    const foreign = await createUser(app, 'boreal');
    await boreal.http.put(`/v1/admin/promoters/${foreign.id}`, { commissionBps: 1000 });

    expect(await report(session, `${today}&promoterId=${promoter.id}&userId=${loose.id}&type=player`)).toEqual(EMPTY);

    for (const id of [loose.id, foreign.id, '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b']) {
      expect((await session.http.get(`${URL}?${today}&promoterId=${id}`)).status).toBe(404);
    }
  });
});
