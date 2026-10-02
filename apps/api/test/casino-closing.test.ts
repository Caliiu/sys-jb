import type { INestApplication } from '@nestjs/common';
import { type AdminCasinoClosing, type OperatorRole, casinoClosingMonths } from '@sysjb/contracts';
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

const { previous, current } = casinoClosingMonths(new Date().toISOString());
const ZERO = { turnoverCents: 0, payoutCents: 0, ggrCents: 0, commissionCents: 0 };
const URL = '/v1/admin/reports/casino/closing';

describe('GET /v1/admin/reports/casino/closing', () => {
  it('exige operation.read; sem mês: os cards do mês anterior (encerrado) e do atual, sem detalhamento', async () => {
    expect((await consoleApi(app).get(URL)).status).toBe(401);
    const allowed: Record<OperatorRole, number> = { MANAGER: 200, FINANCE: 200, SUPPORT: 403 };
    for (const [role, status] of Object.entries(allowed) as Array<[OperatorRole, number]>) {
      const session = await loginOperator(app, 'aurora', { role });
      const res = await session.http.get(URL);
      expect(res.status, role).toBe(status);
      if (status === 200) {
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body).toEqual({
          months: [
            { month: previous, ended: true, totals: ZERO, promotersWithCommission: 0 },
            { month: current, ended: false, totals: ZERO, promotersWithCommission: 0 },
          ],
          detail: null,
          available: false,
        });
      }
    }
  });

  it('com mês: os promotores da banca, com a % de cassino e os indicados (valores zerados: ainda sem cassino)', async () => {
    const session = await loginOperator(app, 'aurora');
    const bia = await createUser(app, 'aurora', { name: 'Bia Promotora' });
    const ana = await createUser(app, 'aurora', { name: 'Ana Promotora' });
    await createUser(app, 'aurora', { name: 'Caio Jogador' });
    await session.http.put(`/v1/admin/promoters/${bia.id}`, { commissionBps: 700, casinoCommissionBps: 2500 });
    await session.http.put(`/v1/admin/promoters/${ana.id}`, { commissionBps: 500 });
    await createUser(app, 'aurora', { inviteCode: bia.inviteCode });
    const boreal = await loginOperator(app, 'boreal');
    const foreign = await createUser(app, 'boreal');
    await boreal.http.put(`/v1/admin/promoters/${foreign.id}`, { commissionBps: 100 });

    const body = (await session.http.get(`${URL}?month=${previous}`)).body as AdminCasinoClosing;
    expect(body.detail).toEqual({
      month: previous,
      ended: true,
      totals: ZERO,
      rows: [
        {
          promoter: { id: ana.id, displayId: ana.displayId, name: 'Ana Promotora' },
          casinoCommissionBps: 0,
          referralsCount: 0,
          ...ZERO,
        },
        {
          promoter: { id: bia.id, displayId: bia.displayId, name: 'Bia Promotora' },
          casinoCommissionBps: 2500,
          referralsCount: 1,
          ...ZERO,
        },
      ],
    });
    expect(((await session.http.get(`${URL}?month=${current}`)).body as AdminCasinoClosing).detail?.ended).toBe(false);
  });

  it.each([
    ['mês inválido', 'month=2026-13'],
    ['formato errado', 'month=2026-1'],
    ['mês futuro', 'month=2099-01'],
    ['parâmetro desconhecido', `month=${current}&x=1`],
  ])('recusa %s (400)', async (_label, query) => {
    const session = await loginOperator(app, 'aurora');
    expect((await session.http.get(`${URL}?${query}`)).status).toBe(400);
  });
});
