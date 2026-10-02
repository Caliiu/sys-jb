import type { INestApplication } from '@nestjs/common';
import { type AdminCasinoGeneralReport, type OperatorRole, drawDateOf } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { consoleApi, createUser, loginOperator, migratorPool, resetUsers, runtimePool, startApp } from './helpers.js';

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

const EMPTY: AdminCasinoGeneralReport = {
  from: TODAY,
  to: TODAY,
  rows: [],
  totals: { turnoverCents: 0, payoutCents: 0, netCents: 0 },
  available: false,
};

describe('GET /v1/admin/reports/casino/general', () => {
  it('exige operador com operation.read: Gerente e Financeiro veem; Suporte não', async () => {
    expect((await consoleApi(app).get(`/v1/admin/reports/casino/general?${today}`)).status).toBe(401);
    const allowed: Record<OperatorRole, number> = { MANAGER: 200, FINANCE: 200, SUPPORT: 403 };
    for (const [role, status] of Object.entries(allowed) as Array<[OperatorRole, number]>) {
      const session = await loginOperator(app, 'aurora', { role });
      const res = await session.http.get(`/v1/admin/reports/casino/general?${today}`);
      expect(res.status, role).toBe(status);
      if (status === 200) {
        expect(res.headers['cache-control']).toBe('no-store');
        // Sem cassino no sistema: vazio e marcado como indisponível.
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
    expect((await session.http.get(`/v1/admin/reports/casino/general?${query}`)).status).toBe(400);
  });

  it('aceita os filtros; promotor inexistente, jogador comum ou de outra banca = 404', async () => {
    const session = await loginOperator(app, 'aurora');
    const promoter = await createUser(app, 'aurora');
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 1000 });
    const loose = await createUser(app, 'aurora');
    const boreal = await loginOperator(app, 'boreal');
    const foreign = await createUser(app, 'boreal');
    await boreal.http.put(`/v1/admin/promoters/${foreign.id}`, { commissionBps: 1000 });

    const filtered = await session.http.get(
      `/v1/admin/reports/casino/general?${today}&promoterId=${promoter.id}&userId=${loose.id}&type=player`,
    );
    expect(filtered.status, JSON.stringify(filtered.body)).toBe(200);
    expect(filtered.body).toEqual(EMPTY);

    for (const id of [loose.id, foreign.id, '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b']) {
      expect((await session.http.get(`/v1/admin/reports/casino/general?${today}&promoterId=${id}`)).status).toBe(404);
    }
  });
});
