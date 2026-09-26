import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type AdminUserDetail, type AdminUserListItem, type OperatorRole, ROLE_PERMISSIONS } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FAILURES } from '../src/auth/auth.service.js';
import { OPERATOR_SESSION_TTL_MS } from '../src/admin/operator-auth.service.js';
import {
  api,
  asTenant,
  createOperator,
  createUser,
  formatCpf,
  loginOperator,
  migratorPool,
  OPERATOR_PASSWORD,
  resetUsers,
  runtimePool,
  startApp,
  SYNTHETIC_PASSWORD,
  tenantId,
} from './helpers.js';

let app: INestApplication;
let auroraId: string;
let borealId: string;

beforeAll(async () => {
  app = await startApp();
  auroraId = await tenantId('aurora');
  borealId = await tenantId('boreal');
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

const operatorLogin = (email: string, password: string, tenant: 'aurora' | 'boreal' = 'aurora') =>
  api(app, tenant).post('/v1/admin/auth/login', { email, password });

const auditRows = (tenant: string, userId: string) =>
  asTenant(migratorPool, tenant, async (c) => {
    const { rows } = await c.query<{ action: string; details: unknown; operator_id: string }>(
      'SELECT action, details, operator_id FROM audit_logs WHERE target_id = $1 ORDER BY created_at',
      [userId],
    );
    return rows;
  });

describe('login do operador', () => {
  it('entra com e-mail e senha e recebe token opaco, perfil e permissões', async () => {
    const { email, password } = await createOperator('aurora', { role: 'SUPPORT' });
    const res = await operatorLogin(email, password);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Date(res.body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(OPERATOR_SESSION_TTL_MS);
    expect(res.body.operator).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      email,
      role: 'SUPPORT',
      permissions: ROLE_PERMISSIONS.SUPPORT,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
  });

  it('o e-mail é comparado sem diferenciar maiúsculas e espaços', async () => {
    const { email, password } = await createOperator('aurora');
    const res = await operatorLogin(`  ${email.toUpperCase()} `, password);
    expect(res.status).toBe(200);
  });

  it('só o hash do token é guardado', async () => {
    const { email, password } = await createOperator('aurora');
    const { body } = await operatorLogin(email, password);
    const { rows } = await asTenant(migratorPool, auroraId, (c) => c.query('SELECT token_hash FROM operator_sessions'));
    expect(rows).toEqual([{ token_hash: sha256(body.token) }]);
  });

  it('senha errada, e-mail inexistente e operador inativo têm a mesma resposta', async () => {
    const active = await createOperator('aurora');
    const inactive = await createOperator('aurora', { active: false });

    const responses = await Promise.all([
      operatorLogin(active.email, 'senha errada'),
      operatorLogin('ninguem@example.test', OPERATOR_PASSWORD),
      operatorLogin(inactive.email, inactive.password),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha inválidos.',
      });
    }
  });

  it('operador de uma banca não entra em outra', async () => {
    const { email, password } = await createOperator('aurora');
    expect((await operatorLogin(email, password, 'boreal')).status).toBe(401);
  });

  it('bloqueia temporariamente após várias falhas, mesmo com a senha certa', async () => {
    const { email, password } = await createOperator('aurora');
    for (let i = 0; i < MAX_FAILURES; i += 1) {
      expect((await operatorLogin(email, 'errada')).status).toBe(401);
    }
    const locked = await operatorLogin(email, password);
    expect(locked.status).toBe(429);
    expect(locked.headers['retry-after']).toMatch(/^\d+$/);

    const other = await createOperator('aurora');
    expect((await operatorLogin(other.email, other.password)).status).toBe(200);
  });

  it('as falhas do operador não bloqueiam o cliente com o mesmo texto (espaços de nome separados)', async () => {
    const { email } = await createOperator('aurora');
    for (let i = 0; i < MAX_FAILURES; i += 1) await operatorLogin(email, 'errada');
    const { rows } = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT identifier_hash FROM login_failures'),
    );
    expect(rows).toHaveLength(MAX_FAILURES);
    const user = await createUser(app, 'aurora');
    const res = await api(app, 'aurora').post('/v1/auth/login', {
      document: user.document,
      password: SYNTHETIC_PASSWORD,
    });
    expect(res.status).toBe(200);
  });

  it('rejeita campos desconhecidos e corpo incompleto', async () => {
    const { email, password } = await createOperator('aurora');
    expect((await api(app, 'aurora').post('/v1/admin/auth/login', { email, password, role: 'MANAGER' })).status).toBe(
      400,
    );
    expect((await api(app, 'aurora').post('/v1/admin/auth/login', { email })).status).toBe(400);
  });

  it('exige a credencial de serviço da banca', async () => {
    const { email, password } = await createOperator('aurora');
    const res = await api(app, 'aurora', 'x'.repeat(40)).post('/v1/admin/auth/login', { email, password });
    expect(res.status).toBe(401);
  });
});

describe('sessão do operador', () => {
  it('GET /admin/me devolve o operador da sessão', async () => {
    const session = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    const res = await session.http.get('/v1/admin/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(session.operator);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('sem token, com token malformado ou desconhecido: 401 SESSION_INVALID', async () => {
    const base = api(app, 'aurora');
    for (const token of [undefined, '', 'curto', 'a'.repeat(43), 'ç'.repeat(43)]) {
      const req = base.get('/v1/admin/me');
      const res = token === undefined ? await req : await req.set('X-Operator-Token', token);
      expect(res.status, String(token)).toBe(401);
      expect(res.body.code).toBe('SESSION_INVALID');
    }
  });

  it('token com lixo anexado no header é rejeitado', async () => {
    const session = await loginOperator(app, 'aurora');
    const res = await api(app, 'aurora')
      .get('/v1/admin/me')
      .set('X-Operator-Token', `${session.token}, ${session.token}`);
    expect(res.status).toBe(401);
  });

  it('a sessão só vale na banca onde foi criada', async () => {
    const session = await loginOperator(app, 'aurora');
    const res = await api(app, 'boreal').get('/v1/admin/me').set('X-Operator-Token', session.token);
    expect(res.status).toBe(401);
  });

  it('a sessão de cliente não vale como sessão de operador (e vice-versa)', async () => {
    const user = await createUser(app, 'aurora');
    const clientSession = await api(app, 'aurora').post('/v1/auth/login', {
      document: user.document,
      password: SYNTHETIC_PASSWORD,
    });
    const asOperator = await api(app, 'aurora').get('/v1/admin/me').set('X-Operator-Token', clientSession.body.token);
    expect(asOperator.status).toBe(401);

    const operator = await loginOperator(app, 'aurora');
    const asClient = await api(app, 'aurora').get('/v1/me').set('X-Session-Token', operator.token);
    expect(asClient.status).toBe(401);
  });

  it('logout encerra a sessão e é idempotente', async () => {
    const session = await loginOperator(app, 'aurora');
    expect((await session.http.post('/v1/admin/auth/logout', {})).status).toBe(204);
    expect((await session.http.get('/v1/admin/me')).status).toBe(401);
    expect((await session.http.post('/v1/admin/auth/logout', {})).status).toBe(204);
    expect((await api(app, 'aurora').post('/v1/admin/auth/logout', {})).status).toBe(204);
  });

  it('sessão expirada é rejeitada', async () => {
    const session = await loginOperator(app, 'aurora');
    await asTenant(migratorPool, auroraId, (c) =>
      c.query(
        "UPDATE operator_sessions SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'",
      ),
    );
    expect((await session.http.get('/v1/admin/me')).status).toBe(401);
  });

  it('operador desativado perde o acesso na hora', async () => {
    const session = await loginOperator(app, 'aurora');
    await asTenant(migratorPool, auroraId, (c) => c.query('UPDATE operators SET active = false'));
    expect((await session.http.get('/v1/admin/me')).status).toBe(401);
  });

  it('rotas do painel exigem sessão de operador (a credencial de serviço sozinha não basta)', async () => {
    const user = await createUser(app, 'aurora');
    for (const path of ['/v1/admin/users', `/v1/admin/users/${user.id}`]) {
      const res = await api(app, 'aurora').get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.code).toBe('SESSION_INVALID');
    }
    expect((await api(app, 'aurora').patch(`/v1/admin/users/${user.id}`, { name: 'Novo Nome' })).status).toBe(401);
    expect((await api(app, 'aurora').patch(`/v1/admin/users/${user.id}/status`, { status: 'BLOCKED' })).status).toBe(
      401,
    );
  });
});

describe('perfis e permissões', () => {
  const matrix: Array<[OperatorRole, { read: number; update: number; status: number }]> = [
    ['MANAGER', { read: 200, update: 200, status: 200 }],
    ['SUPPORT', { read: 200, update: 200, status: 403 }],
    ['FINANCE', { read: 200, update: 403, status: 403 }],
  ];

  it.each(matrix)('%s', async (role, expected) => {
    const session = await loginOperator(app, 'aurora', { role });
    const user = await createUser(app, 'aurora');

    expect((await session.http.get('/v1/admin/users')).status).toBe(expected.read);
    expect((await session.http.get(`/v1/admin/users/${user.id}`)).status).toBe(expected.read);
    const update = await session.http.patch(`/v1/admin/users/${user.id}`, { name: 'Nome Corrigido' });
    expect(update.status).toBe(expected.update);
    const status = await session.http.patch(`/v1/admin/users/${user.id}/status`, { status: 'BLOCKED' });
    expect(status.status).toBe(expected.status);

    for (const denied of [update, status].filter((res) => res.status === 403)) {
      expect(denied.body).toEqual({ statusCode: 403, code: 'FORBIDDEN', message: 'Sem permissão para esta ação.' });
    }
  });

  it('permissão negada não altera nada nem gera auditoria', async () => {
    const session = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    const user = await createUser(app, 'aurora');
    await session.http.patch(`/v1/admin/users/${user.id}`, { name: 'Nome Corrigido' });
    await session.http.patch(`/v1/admin/users/${user.id}/status`, { status: 'BLOCKED' });

    const after = await api(app, 'aurora').get(`/v1/users/${user.id}`);
    expect(after.body.name).toBe(user.name);
    expect(await auditRows(auroraId, user.id)).toEqual([]);
  });
});

describe('lista de usuários', () => {
  it('só mostra usuários da banca do operador, com CPF e telefone mascarados', async () => {
    const session = await loginOperator(app, 'aurora');
    const mine = await createUser(app, 'aurora');
    await createUser(app, 'boreal');

    const res = await session.http.get('/v1/admin/users');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.total).toBe(1);
    const [item] = res.body.items as AdminUserListItem[];
    expect(item).toEqual({
      id: mine.id,
      displayId: mine.displayId,
      name: mine.name,
      documentMasked: `***.${mine.document.slice(3, 6)}.${mine.document.slice(6, 9)}-**`,
      phoneMasked: expect.stringMatching(/^\(\d{2}\) \*+-\d{4}$/),
      status: 'ACTIVE',
      createdAt: expect.any(String),
    });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(mine.document);
    expect(raw).not.toContain(mine.phone);
    expect(raw).not.toMatch(/passwordHash|birthDate|tenantId/);
  });

  it('pagina em ordem estável (mais novos primeiro), sem repetir nem perder linhas', async () => {
    const session = await loginOperator(app, 'aurora');
    const created = [];
    for (let i = 0; i < 5; i += 1) created.push(await createUser(app, 'aurora'));

    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const res = await session.http.get(`/v1/admin/users?page=${page}&pageSize=2`);
      expect(res.body).toMatchObject({ page, pageSize: 2, total: 5, totalPages: 3 });
      seen.push(...res.body.items.map((item: AdminUserListItem) => item.id));
    }
    expect(seen).toEqual(created.map((u) => u.id).reverse());
    expect((await session.http.get('/v1/admin/users?page=4&pageSize=2')).body.items).toEqual([]);
  });

  it('lista vazia devolve totalPages 1', async () => {
    const session = await loginOperator(app, 'aurora');
    const res = await session.http.get('/v1/admin/users');
    expect(res.body).toEqual({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
  });

  it('busca por nome (sem diferenciar maiúsculas), CPF, telefone e ID', async () => {
    const session = await loginOperator(app, 'aurora');
    const ana = await createUser(app, 'aurora', { name: 'Ana Souza Lima' });
    const bruno = await createUser(app, 'aurora', { name: 'Bruno Alves' });

    const ids = async (search: string) =>
      (
        (await session.http.get(`/v1/admin/users?search=${encodeURIComponent(search)}`)).body
          .items as AdminUserListItem[]
      )
        .map((item) => item.id)
        .sort();

    expect(await ids('souza')).toEqual([ana.id]);
    expect(await ids('ANA')).toEqual([ana.id]);
    expect(await ids(bruno.document)).toEqual([bruno.id]);
    expect(await ids(formatCpf(bruno.document))).toEqual([bruno.id]);
    expect(await ids(ana.phone.slice(0, 7))).toContain(ana.id);
    expect(await ids(String(bruno.displayId))).toEqual([bruno.id]);
    expect(await ids('inexistente')).toEqual([]);
  });

  it('a busca não trata "%" e "_" como curinga', async () => {
    const session = await loginOperator(app, 'aurora');
    await createUser(app, 'aurora');
    const find = async (search: string) => {
      const res = await session.http.get(`/v1/admin/users?search=${encodeURIComponent(search)}`);
      expect(res.status, search).toBe(200);
      return (res.body.items as AdminUserListItem[]).map((item) => item.id);
    };

    for (const search of ['%', '_', '%%%', 'a%a', '\\']) expect(await find(search), search).toEqual([]);

    // Os mesmos caracteres continuam pesquisáveis quando fazem parte do nome.
    const literal = await createUser(app, 'aurora', { name: 'Promo 100% Real_Nome' });
    expect(await find('100% Real_')).toEqual([literal.id]);
    expect(await find('100_ Real')).toEqual([]);
  });

  it('filtra por status', async () => {
    const session = await loginOperator(app, 'aurora');
    const active = await createUser(app, 'aurora');
    const blocked = await createUser(app, 'aurora');
    await session.http.patch(`/v1/admin/users/${blocked.id}/status`, { status: 'BLOCKED' });

    const only = async (status: string) =>
      ((await session.http.get(`/v1/admin/users?status=${status}`)).body.items as AdminUserListItem[]).map((i) => i.id);
    expect(await only('ACTIVE')).toEqual([active.id]);
    expect(await only('BLOCKED')).toEqual([blocked.id]);
  });

  it('rejeita parâmetros inválidos', async () => {
    const session = await loginOperator(app, 'aurora');
    for (const query of [
      'pageSize=101',
      'pageSize=0',
      'page=0',
      'page=abc',
      'status=OUTRO',
      'x=1',
      `search=${'a'.repeat(101)}`,
    ]) {
      const res = await session.http.get(`/v1/admin/users?${query}`);
      expect(res.status, query).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('detalhe do usuário', () => {
  it('mostra os dados completos, carteira e último acesso', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');

    const before = (await session.http.get(`/v1/admin/users/${user.id}`)).body as AdminUserDetail;
    expect(before).toEqual({
      id: user.id,
      displayId: user.displayId,
      name: user.name,
      email: null,
      phone: user.phone,
      document: user.document,
      birthDate: '1990-05-17',
      status: 'ACTIVE',
      createdAt: expect.any(String),
      lastLoginAt: null,
      wallet: user.wallet,
    });

    await api(app, 'aurora').post('/v1/auth/login', { document: user.document, password: SYNTHETIC_PASSWORD });
    const after = (await session.http.get(`/v1/admin/users/${user.id}`)).body as AdminUserDetail;
    expect(after.lastLoginAt).toEqual(expect.any(String));
    expect(JSON.stringify(after)).not.toMatch(/passwordHash|argon2|tenantId/);
  });

  it('usuário de outra banca ou inexistente: 404; id inválido: 400', async () => {
    const session = await loginOperator(app, 'aurora');
    const foreign = await createUser(app, 'boreal');
    expect((await session.http.get(`/v1/admin/users/${foreign.id}`)).status).toBe(404);
    expect((await session.http.get('/v1/admin/users/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await session.http.get('/v1/admin/users/nao-e-uuid')).status).toBe(400);
  });
});

describe('edição de cadastro', () => {
  it('corrige os campos informados e registra na auditoria só os nomes dos campos', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');

    const res = await session.http.patch(`/v1/admin/users/${user.id}`, {
      name: 'Nome Corrigido',
      email: 'Corrigido@Example.Test',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Nome Corrigido', email: 'corrigido@example.test', phone: user.phone });

    const rows = await auditRows(auroraId, user.id);
    expect(rows).toEqual([
      { action: 'user.update', details: { fields: ['name', 'email'] }, operator_id: session.operator.id },
    ]);
    expect(JSON.stringify(rows)).not.toContain('Corrigido');
  });

  it('null limpa o e-mail', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora', { email: 'a@example.test' });
    const res = await session.http.patch(`/v1/admin/users/${user.id}`, { email: null });
    expect(res.body.email).toBeNull();
  });

  it('CPF ou telefone já usados na banca: 409 sem revelar valores, e nada é auditado', async () => {
    const session = await loginOperator(app, 'aurora');
    const first = await createUser(app, 'aurora');
    const second = await createUser(app, 'aurora');

    const res = await session.http.patch(`/v1/admin/users/${second.id}`, { document: first.document });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
    expect(JSON.stringify(res.body)).not.toContain(first.document);
    expect(await auditRows(auroraId, second.id)).toEqual([]);
  });

  it('valida os dados e não aceita campos fora do cadastro', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');
    const invalid: Array<Record<string, unknown>> = [
      {},
      { name: 'A' },
      { document: '11111111111' },
      { phone: '123' },
      { email: 'sem-arroba' },
      { password: 'nova senha forte 123' },
      { avatar: 'https://example.test/a.png' },
      { status: 'BLOCKED' },
      { tenantId: borealId },
      { displayId: 1 },
    ];
    for (const body of invalid) {
      const res = await session.http.patch(`/v1/admin/users/${user.id}`, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('usuário de outra banca: 404 e nada é alterado', async () => {
    const session = await loginOperator(app, 'aurora');
    const foreign = await createUser(app, 'boreal');
    expect((await session.http.patch(`/v1/admin/users/${foreign.id}`, { name: 'Invasor Nome' })).status).toBe(404);
    expect((await api(app, 'boreal').get(`/v1/users/${foreign.id}`)).body.name).toBe(foreign.name);
    expect(await auditRows(borealId, foreign.id)).toEqual([]);
  });
});

describe('bloqueio de usuário', () => {
  const clientLogin = (document: string, password = SYNTHETIC_PASSWORD) =>
    api(app, 'aurora').post('/v1/auth/login', { document, password });

  it('bloquear encerra as sessões abertas e impede novo login', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');
    const clientSession = (await clientLogin(user.document)).body.token as string;
    expect((await api(app, 'aurora').get('/v1/me').set('X-Session-Token', clientSession)).status).toBe(200);

    const res = await session.http.patch(`/v1/admin/users/${user.id}/status`, { status: 'BLOCKED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('BLOCKED');

    const me = await api(app, 'aurora').get('/v1/me').set('X-Session-Token', clientSession);
    expect(me.status).toBe(401);
    expect(me.body.code).toBe('SESSION_INVALID');

    const blocked = await clientLogin(user.document);
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual({
      statusCode: 403,
      code: 'ACCOUNT_BLOCKED',
      message: 'Conta bloqueada. Entre em contato com o suporte.',
    });

    const { rows } = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT count(*)::int AS open FROM sessions WHERE revoked_at IS NULL'),
    );
    expect(rows[0].open).toBe(0);
  });

  it('senha errada em conta bloqueada continua "credenciais inválidas" (não revela o bloqueio)', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');
    await session.http.patch(`/v1/admin/users/${user.id}/status`, { status: 'BLOCKED' });

    const res = await clientLogin(user.document, 'senha errada de propósito');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('reativar devolve o acesso; repetir o status não gera auditoria extra', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');
    const set = (status: string) => session.http.patch(`/v1/admin/users/${user.id}/status`, { status });

    expect((await set('BLOCKED')).status).toBe(200);
    expect((await set('BLOCKED')).status).toBe(200);
    expect((await set('ACTIVE')).status).toBe(200);
    expect((await set('ACTIVE')).status).toBe(200);
    expect((await clientLogin(user.document)).status).toBe(200);

    const rows = await auditRows(auroraId, user.id);
    expect(rows.map((row) => row.action)).toEqual(['user.block', 'user.unblock']);
    expect(rows.every((row) => row.operator_id === session.operator.id)).toBe(true);
  });

  it('valida o corpo e respeita a banca', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');
    const foreign = await createUser(app, 'boreal');
    const patch = (id: string, body: unknown) => session.http.patch(`/v1/admin/users/${id}/status`, body);

    expect((await patch(user.id, { status: 'SUSPENDED' })).status).toBe(400);
    expect((await patch(user.id, {})).status).toBe(400);
    expect((await patch(user.id, { status: 'BLOCKED', extra: 1 })).status).toBe(400);
    expect((await patch(foreign.id, { status: 'BLOCKED' })).status).toBe(404);
    expect(
      (await api(app, 'boreal').post('/v1/auth/login', { document: foreign.document, password: SYNTHETIC_PASSWORD }))
        .status,
    ).toBe(200);
  });
});

describe('banco de dados: isolamento e privilégios', () => {
  it('operadores, sessões e auditoria são isolados por banca (RLS)', async () => {
    const aurora = await loginOperator(app, 'aurora');
    await loginOperator(app, 'boreal');
    const user = await createUser(app, 'aurora');
    await aurora.http.patch(`/v1/admin/users/${user.id}/status`, { status: 'BLOCKED' });

    for (const table of ['operators', 'operator_sessions', 'audit_logs']) {
      const own = await asTenant(runtimePool, auroraId, (c) => c.query(`SELECT tenant_id FROM ${table}`));
      expect(own.rows.length, table).toBeGreaterThan(0);
      expect(
        own.rows.every((r: { tenant_id: string }) => r.tenant_id === auroraId),
        table,
      ).toBe(true);
      const client = await runtimePool.connect();
      try {
        expect((await client.query(`SELECT 1 FROM ${table}`)).rowCount, `${table} sem contexto`).toBe(0);
      } finally {
        client.release();
      }
    }
  });

  it('a role de runtime não cria nem altera operadores', async () => {
    const { email } = await createOperator('aurora');
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query(
          `INSERT INTO operators (tenant_id, name, email, password_hash, role, updated_at)
           VALUES ($1, 'Invasor', 'invasor@example.test', '$argon2id$x', 'MANAGER', now())`,
          [auroraId],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query("UPDATE operators SET role = 'MANAGER' WHERE email = $1", [email]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a trilha de auditoria é somente inclusão', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');
    await session.http.patch(`/v1/admin/users/${user.id}/status`, { status: 'BLOCKED' });

    await expect(
      asTenant(runtimePool, auroraId, (c) => c.query("UPDATE audit_logs SET action = 'user.update'")),
    ).rejects.toThrow(/permission denied/);
    await expect(asTenant(runtimePool, auroraId, (c) => c.query('DELETE FROM audit_logs'))).rejects.toThrow(
      /permission denied/,
    );
    expect(await auditRows(auroraId, user.id)).toHaveLength(1);
  });

  it('usuário só nasce ACTIVE, mesmo se a aplicação tentar outro status', async () => {
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query(
          `INSERT INTO users (tenant_id, name, phone, document, birth_date, password_hash, status, updated_at)
           VALUES ($1, 'Pessoa Bloqueada', '11912345678', '52998224725', '1990-01-01', '$argon2id$x', 'BLOCKED', now())`,
          [auroraId],
        ),
      ),
    ).rejects.toThrow(/users must be created with status ACTIVE/);
  });

  it('a role de runtime só altera o status entre as colunas novas de users', async () => {
    const user = await createUser(app, 'aurora');
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query("UPDATE users SET password_hash = '$argon2id$x' WHERE id = $1", [user.id]),
      ),
    ).rejects.toThrow(/permission denied/);
    await asTenant(runtimePool, auroraId, (c) =>
      c.query("UPDATE users SET status = 'BLOCKED' WHERE id = $1", [user.id]),
    );
  });
});
