import type { INestApplication } from '@nestjs/common';
import type { LoginResponse, PublicProfile, PublicUser } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  asTenant,
  createOperator,
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

type Tenant = 'aurora' | 'boreal';

const login = (tenant: Tenant, document: string, password = SYNTHETIC_PASSWORD) =>
  api(app, tenant).post('/v1/auth/login', { document, password });

/** Cadastra e faz login: devolve o usuário, o token e um cliente HTTP já autenticado como ele. */
async function signIn(tenant: Tenant = 'aurora', extra: Record<string, unknown> = {}) {
  const person = await createUser(app, tenant, extra);
  const res = await login(tenant, person.document);
  const session = res.body as LoginResponse;
  const http = api(app, tenant, KEYS[tenant], { 'X-Session-Token': session.token });
  return { person, token: session.token, http };
}

const storedHash = (userId: string) =>
  asTenant(migratorPool, auroraId, async (c) => {
    const { rows } = await c.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [
      userId,
    ]);
    return rows[0]!.password_hash;
  });

describe('GET /v1/me/profile', () => {
  it('devolve o perfil do usuário da sessão, com a data de nascimento, e sem segredos', async () => {
    const { person, http } = await signIn();
    const res = await http.get('/v1/me/profile');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ ...person, birthDate: '1990-05-17' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|tenantId/);
  });

  it('sem sessão, com token inválido ou de outra banca: 401', async () => {
    const { token } = await signIn('aurora');
    const base = api(app, 'aurora');
    for (const bad of [undefined, '', 'curto', 'a'.repeat(43), `${token}x`]) {
      const req = base.get('/v1/me/profile');
      const res = bad === undefined ? await req : await req.set('X-Session-Token', bad);
      expect(res.status, String(bad)).toBe(401);
      expect(res.body.code).toBe('SESSION_INVALID');
    }
    const foreign = await api(app, 'boreal').get('/v1/me/profile').set('X-Session-Token', token);
    expect(foreign.status).toBe(401);
  });

  it('exige também a credencial de serviço da banca', async () => {
    const { token } = await signIn();
    const res = await api(app, 'aurora', 'x'.repeat(40)).get('/v1/me/profile').set('X-Session-Token', token);
    expect(res.status).toBe(401);
  });

  it('a sessão de operador não abre o perfil de cliente', async () => {
    const operator = await loginOperator(app, 'aurora');
    const res = await api(app, 'aurora').get('/v1/me/profile').set('X-Session-Token', operator.token);
    expect(res.status).toBe(401);
  });

  it('cada sessão vê só a própria conta', async () => {
    const first = await signIn();
    const second = await signIn();
    expect((await first.http.get('/v1/me/profile')).body.id).toBe(first.person.id);
    expect((await second.http.get('/v1/me/profile')).body.id).toBe(second.person.id);
  });

  it('usuário bloqueado perde o acesso ao perfil na hora', async () => {
    const { person, http } = await signIn();
    const operator = await loginOperator(app, 'aurora');
    await operator.http.patch(`/v1/admin/users/${person.id}/status`, { status: 'BLOCKED' });
    expect((await http.get('/v1/me/profile')).status).toBe(401);
  });
});

describe('PATCH /v1/me', () => {
  it('atualiza e-mail e telefone do usuário da sessão', async () => {
    const { person, http } = await signIn();
    const res = await http.patch('/v1/me', { email: 'Novo@Example.Test', phone: '(21) 91234-5678' });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ id: person.id, email: 'novo@example.test', phone: '21912345678' });
    expect(res.body.document).toBe(person.document);
    expect(res.body.birthDate).toBe('1990-05-17');

    const again = (await http.get('/v1/me/profile')).body as PublicProfile;
    expect(again).toMatchObject({ email: 'novo@example.test', phone: '21912345678' });
  });

  it('campo ausente mantém o valor; null limpa o e-mail', async () => {
    const { person, http } = await signIn('aurora', { email: 'a@example.test' });
    const onlyPhone = await http.patch('/v1/me', { phone: '21987654321' });
    expect(onlyPhone.body).toMatchObject({ email: 'a@example.test', phone: '21987654321' });

    const cleared = await http.patch('/v1/me', { email: null });
    expect(cleared.body.email).toBeNull();
    expect(cleared.body.phone).toBe('21987654321');
    expect(cleared.body.name).toBe(person.name);
  });

  it('só e-mail e telefone: qualquer outro campo é recusado (nome, CPF, nascimento, senha, status, banca...)', async () => {
    const { person, http } = await signIn();
    const forbidden: Array<Record<string, unknown>> = [
      { name: 'Outro Nome' },
      { document: '52998224725' },
      { birthDate: '2000-01-01' },
      { password: 'outra senha forte 123' },
      { status: 'BLOCKED' },
      { tenantId: 'x' },
      { id: '00000000-0000-4000-8000-000000000000' },
      { displayId: 1 },
      { avatar: 'https://example.test/a.png' },
      { wallet: {} },
      { email: 'a@example.test', document: '52998224725' },
    ];
    for (const body of forbidden) {
      const res = await http.patch('/v1/me', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await http.get('/v1/me/profile')).body).toMatchObject({ name: person.name, document: person.document });
  });

  it('valida formato: corpo vazio, e-mail e telefone inválidos', async () => {
    const { http } = await signIn();
    for (const body of [{}, { email: 'sem-arroba' }, { email: '' }, { phone: '123' }, { phone: 'abc' }, { email: 5 }]) {
      const res = await http.patch('/v1/me', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('e-mail ou telefone de outro usuário da banca: 409 sem revelar o valor, e nada é alterado', async () => {
    const other = await createUser(app, 'aurora', { email: 'ocupado@example.test' });
    const { person, http } = await signIn();

    const email = await http.patch('/v1/me', { email: 'ocupado@example.test' });
    expect(email.status).toBe(409);
    expect(email.body.code).toBe('CONFLICT');
    expect(email.body.details).toEqual([{ field: 'email', message: 'Já cadastrado.' }]);
    expect(JSON.stringify(email.body)).not.toContain('ocupado@example.test');

    const phone = await http.patch('/v1/me', { phone: other.phone });
    expect(phone.status).toBe(409);
    expect(phone.body.details).toEqual([{ field: 'phone', message: 'Já cadastrado.' }]);

    expect((await http.get('/v1/me/profile')).body).toMatchObject({ email: null, phone: person.phone });
  });

  it('e-mail e telefone de OUTRA banca não conflitam', async () => {
    const foreign = await createUser(app, 'boreal', { email: 'igual@example.test' });
    const { http } = await signIn('aurora');
    const res = await http.patch('/v1/me', { email: 'igual@example.test', phone: foreign.phone });
    expect(res.status).toBe(200);
  });

  it('repetir o próprio valor é aceito', async () => {
    const { person, http } = await signIn();
    const res = await http.patch('/v1/me', { phone: person.phone });
    expect(res.status).toBe(200);
  });

  it('exige sessão de cliente', async () => {
    const res = await api(app, 'aurora').patch('/v1/me', { email: 'a@example.test' });
    expect(res.status).toBe(401);
  });

  it('a sessão de uma banca não altera usuário de outra', async () => {
    const aurora = await signIn('aurora');
    const boreal = await signIn('boreal');
    const res = await api(app, 'boreal')
      .patch('/v1/me', { email: 'x@example.test' })
      .set('X-Session-Token', aurora.token);
    expect(res.status).toBe(401);
    expect((await boreal.http.get('/v1/me/profile')).body.email).toBeNull();
  });
});

describe('POST /v1/me/password', () => {
  const NEW_PASSWORD = 'uma frase totalmente nova 2026';

  it('troca a senha: a nova entra, a antiga não, e o hash é argon2id (nunca a senha)', async () => {
    const { person, http } = await signIn();
    const before = await storedHash(person.id);

    const res = await http.post('/v1/me/password', { password: NEW_PASSWORD });
    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    expect((await login('aurora', person.document, NEW_PASSWORD)).status).toBe(200);
    expect((await login('aurora', person.document, SYNTHETIC_PASSWORD)).status).toBe(401);

    const after = await storedHash(person.id);
    expect(after).not.toBe(before);
    expect(after).toMatch(/^\$argon2id\$/);
    expect(after).not.toContain(NEW_PASSWORD);
  });

  it('encerra as OUTRAS sessões e mantém a atual', async () => {
    const { person, http } = await signIn();
    const other = (await login('aurora', person.document)).body as LoginResponse; // outro aparelho
    const otherHttp = api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': other.token });
    expect((await otherHttp.get('/v1/me/profile')).status).toBe(200);

    expect((await http.post('/v1/me/password', { password: NEW_PASSWORD })).status).toBe(204);

    expect((await otherHttp.get('/v1/me/profile')).status).toBe(401); // outro aparelho caiu
    expect((await http.get('/v1/me/profile')).status).toBe(200); // esta sessão segue

    const { rows } = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT count(*)::int AS open FROM sessions WHERE revoked_at IS NULL AND user_id = $1', [person.id]),
    );
    expect(rows[0].open).toBe(1);
  });

  it('não encerra as sessões de outros usuários', async () => {
    const mine = await signIn();
    const theirs = await signIn();
    expect((await mine.http.post('/v1/me/password', { password: NEW_PASSWORD })).status).toBe(204);
    expect((await theirs.http.get('/v1/me/profile')).status).toBe(200);
  });

  it('só altera a senha de quem está na sessão (nunca a de outro usuário)', async () => {
    const mine = await signIn();
    const other = await createUser(app, 'aurora');
    await mine.http.post('/v1/me/password', { password: NEW_PASSWORD });
    expect((await login('aurora', other.document)).status).toBe(200); // a senha do outro segue a antiga
  });

  it('aplica as regras de senha do cadastro (tamanho, comum, CPF/telefone/nascimento)', async () => {
    const { person, http } = await signIn();
    const invalid: Record<string, string> = {
      curta: 'abc123',
      comum: 'senha123',
      'só espaços': '        ',
      'contém o CPF': `minha senha ${person.document} ok`,
      'contém o telefone': `fone ${person.phone} fone`,
      'contém o nascimento': 'nasci em 17051990 mesmo',
      longa: 'a'.repeat(129),
    };
    for (const [why, password] of Object.entries(invalid)) {
      const res = await http.post('/v1/me/password', { password });
      expect(res.status, why).toBe(400);
      expect(res.body.code, why).toBe('VALIDATION_ERROR');
      // Todos os problemas apontam para o campo da senha (a de 129 caracteres gera dois avisos).
      const fields = res.body.details.map((d: { field: string }) => d.field);
      expect(new Set(fields), why).toEqual(new Set(['password']));
      expect(JSON.stringify(res.body), why).not.toContain(password.trim() || 'x'.repeat(50));
    }
    // Nada mudou: a senha antiga ainda entra.
    expect((await login('aurora', person.document)).status).toBe(200);
  });

  it('corpo estrito: campo extra, faltando ou de outro tipo é recusado', async () => {
    const { http } = await signIn();
    for (const body of [
      {},
      { password: 123 },
      { password: NEW_PASSWORD, currentPassword: 'x' },
      { senha: NEW_PASSWORD },
    ]) {
      expect((await http.post('/v1/me/password', body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('exige sessão de cliente (a credencial de serviço sozinha não troca senha)', async () => {
    const { person } = await signIn();
    expect((await api(app, 'aurora').post('/v1/me/password', { password: NEW_PASSWORD })).status).toBe(401);
    expect((await login('aurora', person.document)).status).toBe(200);
  });

  it('sessão de outra banca ou de operador não troca a senha', async () => {
    const victim = await signIn('aurora');
    const foreign = await signIn('boreal');
    const operator = await createOperator('aurora');
    void operator;

    const res = await api(app, 'aurora')
      .post('/v1/me/password', { password: NEW_PASSWORD })
      .set('X-Session-Token', foreign.token);
    expect(res.status).toBe(401);
    expect((await login('aurora', victim.person.document)).status).toBe(200);
  });

  it('a nova senha vale mesmo depois de trocar telefone e e-mail no perfil', async () => {
    const { person, http } = await signIn();
    await http.patch('/v1/me', { phone: '21912345678', email: 'novo@example.test' });
    expect((await http.post('/v1/me/password', { password: NEW_PASSWORD })).status).toBe(204);
    expect((await login('aurora', person.document, NEW_PASSWORD)).status).toBe(200);
  });
});

describe('banco de dados: privilégios da troca de senha', () => {
  it('a role de runtime atualiza o hash, mas o formato argon2id continua obrigatório', async () => {
    const { person } = await signIn();
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query("UPDATE users SET password_hash = 'texto-puro' WHERE id = $1", [person.id]),
      ),
    ).rejects.toThrow(/users_password_hash_format/);
  });

  it('a role de runtime continua sem alterar nascimento, id, banca nem número de exibição', async () => {
    const { person } = await signIn();
    for (const set of ["birth_date = '2000-01-01'", 'display_id = 1', `id = '00000000-0000-4000-8000-000000000000'`]) {
      await expect(
        asTenant(runtimePool, auroraId, (c) => c.query(`UPDATE users SET ${set} WHERE id = $1`, [person.id])),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe('sem vazamento entre contas', () => {
  it('o perfil de um usuário nunca traz dados de outro', async () => {
    const a = await signIn();
    const b = await signIn();
    const profile = (await a.http.get('/v1/me/profile')).body as PublicUser;
    expect(JSON.stringify(profile)).not.toContain(b.person.document);
    expect(JSON.stringify(profile)).not.toContain(b.person.phone);
  });
});
