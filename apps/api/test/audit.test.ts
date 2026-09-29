import type { INestApplication } from '@nestjs/common';
import type { AdminAuditEntry, AdminAuditSummary, Page } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditPeriodStart } from '../src/admin/audit-period.js';
import {
  asTenant,
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

  it('filtra por período (dias de Brasília) e resume hoje, 7 dias, 30 dias e total com os mesmos filtros', async () => {
    const session = await loginOperator(app, 'aurora');
    const users = [await createUser(app, 'aurora'), await createUser(app, 'aurora'), await createUser(app, 'aurora')];
    for (const user of users) await session.http.patch(`/v1/admin/users/${user.id}/status`, { status: 'BLOCKED' });
    // Recua dois registros no tempo (o dono do banco pode; o app só insere e lê).
    const aurora = await tenantId('aurora');
    await asTenant(migratorPool, aurora, async (c) => {
      await c.query(`UPDATE audit_logs SET created_at = now() - interval '3 days' WHERE target_id = $1`, [
        users[1]!.id,
      ]);
      await c.query(`UPDATE audit_logs SET created_at = now() - interval '20 days' WHERE target_id = $1`, [
        users[2]!.id,
      ]);
    });

    const ids = async (period: string) => (await list(session, `?period=${period}`)).items.map((e) => e.target?.id);
    expect(await ids('today')).toEqual([users[0]!.id]);
    expect(await ids('7d')).toEqual([users[0]!.id, users[1]!.id]);
    expect(await ids('30d')).toEqual([users[0]!.id, users[1]!.id, users[2]!.id]);

    const summary = await session.http.get('/v1/admin/audit/summary');
    expect(summary.status).toBe(200);
    expect(summary.headers['cache-control']).toBe('no-store');
    expect(summary.body as AdminAuditSummary).toEqual({ today: 1, last7Days: 2, last30Days: 3, total: 3 });
    expect((await session.http.get(`/v1/admin/audit/summary?userId=${users[1]!.id}`)).body).toEqual({
      today: 0,
      last7Days: 1,
      last30Days: 1,
      total: 1,
    });
    expect((await session.http.get('/v1/admin/audit/summary?action=user.update')).body.total).toBe(0);
  });

  it('o dia começa à meia-noite de Brasília (UTC-3)', () => {
    // 02:30 UTC de 29/09 ainda é 28/09 em Brasília (23:30).
    const now = new Date('2026-09-29T02:30:00.000Z');
    expect(auditPeriodStart('today', now).toISOString()).toBe('2026-09-28T03:00:00.000Z');
    expect(auditPeriodStart('7d', now).toISOString()).toBe('2026-09-22T03:00:00.000Z');
    expect(auditPeriodStart('30d', now).toISOString()).toBe('2026-08-30T03:00:00.000Z');
    expect(auditPeriodStart('today', new Date('2026-09-29T03:00:00.000Z')).toISOString()).toBe(
      '2026-09-29T03:00:00.000Z',
    );
  });

  it('só o perfil Gerente consulta; filtros inválidos são 400', async () => {
    for (const role of ['SUPPORT', 'FINANCE'] as const) {
      const operator = await loginOperator(app, 'aurora', { role });
      expect((await operator.http.get('/v1/admin/audit')).status, role).toBe(403);
      expect((await operator.http.get('/v1/admin/audit/summary')).status, role).toBe(403);
    }
    const session = await loginOperator(app, 'aurora');
    for (const bad of ['?action=user.delete', '?userId=123', '?page=0', '?pageSize=500', '?extra=1', '?period=1y']) {
      expect((await session.http.get(`/v1/admin/audit${bad}`)).status, bad).toBe(400);
    }
    for (const bad of ['?period=today', '?page=2', '?userId=123']) {
      expect((await session.http.get(`/v1/admin/audit/summary${bad}`)).status, bad).toBe(400);
    }
  });
});
