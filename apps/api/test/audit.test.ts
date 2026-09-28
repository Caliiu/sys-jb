import type { INestApplication } from '@nestjs/common';
import type { AdminAuditEntry, Page } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser, loginOperator, migratorPool, resetUsers, runtimePool, startApp } from './helpers.js';

let app: INestApplication;

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

type Session = Awaited<ReturnType<typeof loginOperator>>;
const list = async (session: Session, query = '') => {
  const res = await session.http.get(`/v1/admin/audit${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as Page<AdminAuditEntry>;
};

describe('GET /v1/admin/audit', () => {
  it('lista quem fez o quê, em quem e quando, mais recentes primeiro, sem valores pessoais', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');
    await session.http.patch(`/v1/admin/users/${user.id}`, { name: 'Nome Corrigido', email: 'novo@example.test' });
    await session.http.patch(`/v1/admin/users/${user.id}/status`, { status: 'BLOCKED' });
    await session.http.put(`/v1/admin/promoters/${user.id}`, { commissionBps: 1000 });
    await session.http.put(`/v1/admin/promoters/${user.id}`, { commissionBps: 1250 });

    const res = await session.http.get('/v1/admin/audit');
    expect(res.headers['cache-control']).toBe('no-store');
    const page = res.body as Page<AdminAuditEntry>;
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 4, totalPages: 1 });
    expect(page.items.map((e) => e.action)).toEqual([
      'promoter.update',
      'promoter.enable',
      'user.block',
      'user.update',
    ]);

    const operator = { id: session.operator.id, name: session.operator.name, email: session.email };
    const target = { id: user.id, displayId: user.displayId, name: 'Nome Corrigido' };
    expect(page.items[0]).toEqual({
      id: expect.any(String),
      createdAt: expect.any(String),
      action: 'promoter.update',
      operator,
      targetType: 'user',
      target,
      details: { fields: ['promoterCommissionBps'], from: 1000, to: 1250 },
    });
    expect(page.items[2]).toMatchObject({ action: 'user.block', operator, target, details: null });
    expect(page.items[3]).toMatchObject({ action: 'user.update', details: { fields: ['name', 'email'] } });
    expect(JSON.stringify(page)).not.toMatch(/novo@example|passwordHash|tenantId|document|phone/);
  });

  it('filtra por ação e por usuário, e pagina sem repetir registros', async () => {
    const session = await loginOperator(app, 'aurora');
    const [a, b] = [await createUser(app, 'aurora'), await createUser(app, 'aurora')];
    for (const user of [a, b]) {
      await session.http.patch(`/v1/admin/users/${user.id}/status`, { status: 'BLOCKED' });
      await session.http.patch(`/v1/admin/users/${user.id}/status`, { status: 'ACTIVE' });
    }

    expect((await list(session, '?action=user.block')).items.map((e) => e.target?.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
    expect((await list(session, `?userId=${a.id}`)).items.map((e) => e.action)).toEqual(['user.unblock', 'user.block']);
    expect((await list(session, `?userId=${a.id}&action=user.unblock`)).total).toBe(1);

    const first = await list(session, '?pageSize=3');
    const second = await list(session, '?pageSize=3&page=2');
    expect(first).toMatchObject({ total: 4, totalPages: 2 });
    expect(new Set([...first.items, ...second.items].map((e) => e.id)).size).toBe(4);
  });

  it('só registros da banca do operador', async () => {
    const aurora = await loginOperator(app, 'aurora');
    const boreal = await loginOperator(app, 'boreal');
    const foreign = await createUser(app, 'boreal');
    await boreal.http.patch(`/v1/admin/users/${foreign.id}/status`, { status: 'BLOCKED' });

    expect((await list(aurora)).total).toBe(0);
    expect((await list(aurora, `?userId=${foreign.id}`)).total).toBe(0);
    expect((await list(boreal)).total).toBe(1);
  });

  it('só o perfil Gerente consulta; filtros inválidos são 400', async () => {
    for (const role of ['SUPPORT', 'FINANCE'] as const) {
      const res = await (await loginOperator(app, 'aurora', { role })).http.get('/v1/admin/audit');
      expect(res.status, role).toBe(403);
    }
    const session = await loginOperator(app, 'aurora');
    for (const bad of ['?action=user.delete', '?userId=123', '?page=0', '?pageSize=500', '?extra=1']) {
      expect((await session.http.get(`/v1/admin/audit${bad}`)).status, bad).toBe(400);
    }
  });
});
