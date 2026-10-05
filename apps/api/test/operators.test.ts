import type { INestApplication } from '@nestjs/common';
import type {
  AdminAuditEntry,
  AdminOperator,
  OperatorMeResponse,
  OperatorPasswordResponse,
  OperatorRole,
  Page,
} from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  asTenant,
  consoleApi,
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

type Session = Awaited<ReturnType<typeof loginOperator>>;

let seq = 0;
const newOperator = (role: OperatorRole = 'SUPPORT') => {
  seq += 1;
  return { name: `Operadora Sintética ${seq}`, email: `nova${seq}.${Date.now()}@example.test`, role };
};

const login = (email: string, password: string) => consoleApi(app).post('/v1/admin/auth/login', { email, password });

/** Cadastra pelo Gerente e devolve o operador e a senha gerada. */
async function create(manager: Session, role: OperatorRole = 'SUPPORT') {
  const res = await manager.http.post('/v1/admin/operators', newOperator(role));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as OperatorPasswordResponse;
}

const auditOf = async (manager: Session) =>
  ((await manager.http.get('/v1/admin/audit')).body as Page<AdminAuditEntry>).items;

describe('Administração > Operadores', () => {
  it('Gerente cadastra com senha gerada (mostrada uma vez), lista e audita; o novo entra com ela', async () => {
    const manager = await loginOperator(app, 'aurora');
    const input = newOperator('FINANCE');
    const res = await manager.http.post('/v1/admin/operators', { ...input, email: `  ${input.email.toUpperCase()} ` });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const { operator, password } = res.body as OperatorPasswordResponse;
    expect(operator).toEqual({
      id: expect.any(String),
      name: input.name,
      email: input.email,
      role: 'FINANCE',
      active: true,
      createdAt: expect.any(String),
      lastLoginAt: null,
      self: false,
    });
    expect(password).toMatch(/^[A-Za-z0-9_-]{24}$/);

    const list = (await manager.http.get('/v1/admin/operators')).body as AdminOperator[];
    expect(list.map((o) => [o.email, o.self])).toEqual(
      expect.arrayContaining([
        [manager.email, true],
        [input.email, false],
      ]),
    );
    // A lista nunca traz o hash da senha.
    expect(JSON.stringify(list)).not.toContain('argon2');

    const entered = await login(input.email, password);
    expect(entered.status).toBe(200);
    expect(
      ((await manager.http.get('/v1/admin/operators')).body as AdminOperator[]).find((o) => o.id === operator.id),
    ).toMatchObject({ lastLoginAt: expect.any(String) });

    const [entry] = await auditOf(manager);
    expect(entry).toMatchObject({
      action: 'operator.create',
      targetType: 'operator',
      target: null,
      operatorTarget: { id: operator.id, name: input.name, email: input.email },
      details: { fields: ['name', 'email', 'role'] },
    });
  });

  it('Suporte e Financeiro não consultam nem alteram operadores', async () => {
    const manager = await loginOperator(app, 'aurora');
    const { operator } = await create(manager);
    for (const role of ['SUPPORT', 'FINANCE'] as OperatorRole[]) {
      const other = await loginOperator(app, 'aurora', { role });
      expect((await other.http.get('/v1/admin/operators')).status, role).toBe(403);
      expect((await other.http.post('/v1/admin/operators', newOperator())).status, role).toBe(403);
      expect((await other.http.put(`/v1/admin/operators/${operator.id}`, newOperator())).status, role).toBe(403);
      expect((await other.http.patch(`/v1/admin/operators/${operator.id}/status`, { active: false })).status).toBe(403);
      expect((await other.http.post(`/v1/admin/operators/${operator.id}/password`, {})).status, role).toBe(403);
    }
    expect((await consoleApi(app).get('/v1/admin/operators')).status).toBe(401);
  });

  it('e-mail único no sistema todo (inclusive de outra banca); validação dos campos', async () => {
    const manager = await loginOperator(app, 'aurora');
    const boreal = await loginOperator(app, 'boreal');
    const taken = await manager.http.post('/v1/admin/operators', { ...newOperator(), email: boreal.email });
    expect(taken.status).toBe(409);
    expect(taken.body.details).toEqual([{ field: 'email', message: expect.any(String) }]);

    for (const body of [
      { ...newOperator(), name: 'A' },
      { ...newOperator(), email: 'sem-arroba' },
      { ...newOperator(), role: 'ADMIN' },
      { ...newOperator(), active: false },
    ]) {
      expect((await manager.http.post('/v1/admin/operators', body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('alterar nome, e-mail e perfil: audita os campos; o perfil novo vale na próxima chamada', async () => {
    const manager = await loginOperator(app, 'aurora');
    const { operator, password } = await create(manager, 'SUPPORT');
    const session = await login(operator.email, password);
    const token = (session.body as { token: string }).token;
    const me = () => consoleApi(app, { 'X-Operator-Token': token }).get('/v1/admin/me');
    expect(((await me()).body as OperatorMeResponse).operator.permissions).not.toContain('operation.read');

    const res = await manager.http.put(`/v1/admin/operators/${operator.id}`, {
      name: operator.name,
      email: operator.email,
      role: 'FINANCE',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'FINANCE' });
    expect(((await me()).body as OperatorMeResponse).operator.permissions).toContain('operation.read');
    expect((await auditOf(manager))[0]).toMatchObject({ action: 'operator.update', details: { fields: ['role'] } });

    // Nada mudou: sem auditoria nova.
    const before = (await auditOf(manager)).length;
    const same = await manager.http.put(`/v1/admin/operators/${operator.id}`, {
      name: operator.name,
      email: operator.email,
      role: 'FINANCE',
    });
    expect(same.status).toBe(200);
    expect(await auditOf(manager)).toHaveLength(before);
  });

  it('desativar derruba as sessões e impede o login; reativar volta a permitir', async () => {
    const manager = await loginOperator(app, 'aurora');
    const { operator, password } = await create(manager);
    const token = ((await login(operator.email, password)).body as { token: string }).token;
    const me = () => consoleApi(app, { 'X-Operator-Token': token }).get('/v1/admin/me');
    expect((await me()).status).toBe(200);

    const off = await manager.http.patch(`/v1/admin/operators/${operator.id}/status`, { active: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ active: false });
    expect((await me()).status).toBe(401);
    expect((await login(operator.email, password)).status).toBe(401);
    expect(
      (
        await asTenant(migratorPool, auroraId, (c) =>
          c.query('SELECT count(*)::int AS n FROM operator_sessions WHERE operator_id = $1 AND revoked_at IS NULL', [
            operator.id,
          ]),
        )
      ).rows,
    ).toEqual([{ n: 0 }]);

    // Repetir não audita de novo.
    await manager.http.patch(`/v1/admin/operators/${operator.id}/status`, { active: false });
    expect((await auditOf(manager)).filter((e) => e.action === 'operator.deactivate')).toHaveLength(1);

    expect((await manager.http.patch(`/v1/admin/operators/${operator.id}/status`, { active: true })).status).toBe(200);
    expect((await login(operator.email, password)).status).toBe(200);
    expect((await auditOf(manager))[0]).toMatchObject({ action: 'operator.activate' });
  });

  it('gerar nova senha: a antiga para de valer e as sessões abertas caem', async () => {
    const manager = await loginOperator(app, 'aurora');
    const { operator, password } = await create(manager);
    const token = ((await login(operator.email, password)).body as { token: string }).token;

    const res = await manager.http.post(`/v1/admin/operators/${operator.id}/password`, {});
    expect(res.status).toBe(201);
    const fresh = (res.body as OperatorPasswordResponse).password;
    expect(fresh).not.toBe(password);
    expect((await consoleApi(app, { 'X-Operator-Token': token }).get('/v1/admin/me')).status).toBe(401);
    expect((await login(operator.email, password)).status).toBe(401);
    expect((await login(operator.email, fresh)).status).toBe(200);
    expect((await auditOf(manager))[0]).toMatchObject({ action: 'operator.password', details: { fields: [] } });
  });

  it('o Gerente não muda o próprio perfil, a própria situação nem a própria senha (só nome e e-mail)', async () => {
    const manager = await loginOperator(app, 'aurora');
    const id = manager.operator.id;
    const own = { name: manager.operator.name, email: manager.email };

    const demote = await manager.http.put(`/v1/admin/operators/${id}`, { ...own, role: 'SUPPORT' });
    expect(demote.status).toBe(409);
    expect((await manager.http.patch(`/v1/admin/operators/${id}/status`, { active: false })).status).toBe(409);
    expect((await manager.http.post(`/v1/admin/operators/${id}/password`, {})).status).toBe(409);

    const renamed = await manager.http.put(`/v1/admin/operators/${id}`, {
      ...own,
      name: 'Gerente Renomeada',
      role: 'MANAGER',
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: 'Gerente Renomeada', role: 'MANAGER', self: true });
  });

  it('operador de outra banca não existe para este Gerente', async () => {
    const manager = await loginOperator(app, 'aurora');
    const other = await loginOperator(app, 'boreal');
    const id = other.operator.id;
    expect((await manager.http.put(`/v1/admin/operators/${id}`, newOperator())).status).toBe(404);
    expect((await manager.http.patch(`/v1/admin/operators/${id}/status`, { active: false })).status).toBe(404);
    expect((await manager.http.post(`/v1/admin/operators/${id}/password`, {})).status).toBe(404);
    expect(((await manager.http.get('/v1/admin/operators')).body as AdminOperator[]).some((o) => o.id === id)).toBe(
      false,
    );
    expect((await consoleApi(app, { 'X-Operator-Token': other.token }).get('/v1/admin/me')).status).toBe(200);
  });

  it('o banco confere de novo: a API não grava em operators e as funções exigem um Gerente ativo da banca', async () => {
    const manager = await loginOperator(app, 'aurora');
    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    const { operator } = await create(manager);
    const hash = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaA';

    for (const sql of [
      "UPDATE operators SET role = 'MANAGER'",
      `INSERT INTO operators (tenant_id, name, email, password_hash, role, updated_at)
       VALUES ('${auroraId}', 'Intrusa', 'intrusa@example.test', '${hash}', 'MANAGER', now())`,
    ]) {
      await expect(
        asTenant(runtimePool, auroraId, (c) => c.query(sql)),
        sql,
      ).rejects.toMatchObject({ code: '42501' });
    }
    // Chamada direta com um operador que não é Gerente (ou de outra banca): recusada.
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query("SELECT operator_create($1, 'Intrusa', 'intrusa@example.test', 'MANAGER', $2)", [
          support.operator.id,
          hash,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query('SELECT operator_set_active($1, $2, false)', [support.operator.id, operator.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    const borealId = await tenantId('boreal');
    await expect(
      asTenant(runtimePool, borealId, (c) =>
        c.query('SELECT operator_set_active($1, $2, false)', [manager.operator.id, operator.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
