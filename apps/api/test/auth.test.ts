import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { LoginResponse, PublicUser } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FAILURES, SESSION_TTL_MS } from '../src/auth/auth.service.js';
import { todayInBrazil } from '@sysjb/contracts';
import {
  api,
  asTenant,
  cpfFrom,
  createUser,
  formatCpf,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  SYNTHETIC_PASSWORD,
  syntheticUser,
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

/** Data (YYYY-MM-DD) de hoje em Brasília deslocada em anos/dias. */
function shiftedToday(years: number, days = 0): string {
  const [y, m, d] = todayInBrazil().split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y + years, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

const login = (tenant: 'aurora' | 'boreal', document: string, password: string) =>
  api(app, tenant).post('/v1/auth/login', { document, password });

const me = (tenant: 'aurora' | 'boreal', token?: string) => {
  const req = api(app, tenant).get('/v1/me');
  return token === undefined ? req : req.set('X-Session-Token', token);
};

describe('cadastro: CPF, data de nascimento e senha', () => {
  it('exige CPF, data de nascimento e senha', async () => {
    for (const field of ['document', 'birthDate', 'password']) {
      const body: Record<string, unknown> = syntheticUser();
      delete body[field];
      const res = await api(app, 'aurora').post('/v1/users', body);
      expect(res.status, field).toBe(400);
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
    }
  });

  it('valida dígitos verificadores do CPF', async () => {
    const valid = cpfFrom('529982247');
    const wrongCheck = `${valid.slice(0, 10)}${(Number(valid[10]) + 1) % 10}`;
    for (const document of [wrongCheck, '11111111111', '00000000000', '1234567890']) {
      const res = await api(app, 'aurora').post('/v1/users', syntheticUser({ document }));
      expect(res.status, document).toBe(400);
    }
    const ok = await api(app, 'aurora').post('/v1/users', syntheticUser({ document: formatCpf(valid) }));
    expect(ok.status).toBe(201);
    expect(ok.body.document).toBe(valid);
  });

  it('exige 18 anos completos, data real e não futura', async () => {
    const cases: Record<string, number> = {
      [shiftedToday(-18)]: 201, // completa 18 hoje
      [shiftedToday(-18, 1)]: 400, // completa 18 amanhã
      [shiftedToday(0, 1)]: 400, // futuro
      '1899-12-31': 400,
      '2000-02-30': 400,
      '1990-13-01': 400,
      '10/05/1990': 400,
      '1990-5-1': 400,
    };
    for (const [birthDate, status] of Object.entries(cases)) {
      const res = await api(app, 'aurora').post('/v1/users', syntheticUser({ birthDate }));
      expect(res.status, birthDate).toBe(status);
    }
  });

  it('senha: 8 a 128 caracteres, sem senhas óbvias nem dados pessoais', async () => {
    const base = syntheticUser();
    const [y, m, d] = base.birthDate.split('-');
    const bad = [
      'curta',
      'x'.repeat(129),
      '        ',
      '12345678',
      'Senha123',
      `abc${base.document}`,
      `tel${base.phone}`,
      `nasc${d}${m}${y}`,
      `nasc${formatCpf(base.document)}`,
    ];
    for (const password of bad) {
      const res = await api(app, 'aurora').post('/v1/users', { ...base, password });
      expect(res.status, password).toBe(400);
      expect(res.text).not.toContain(password.trim() || 'x');
    }
    expect((await api(app, 'aurora').post('/v1/users', { ...base, password: 'frase longa e sintética' })).status).toBe(
      201,
    );
  });

  it('senha é armazenada só como hash argon2id e nunca é devolvida', async () => {
    const user = await createUser(app, 'aurora');
    const [row] = await asTenant(
      migratorPool,
      auroraId,
      async (c) =>
        (
          await c.query<{ password_hash: string; birth_date: string }>(
            "SELECT password_hash, to_char(birth_date, 'YYYY-MM-DD') AS birth_date FROM users WHERE id = $1",
            [user.id],
          )
        ).rows,
    );
    expect(row?.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(row?.password_hash).not.toContain(SYNTHETIC_PASSWORD);
    expect(row?.birth_date).toBe('1990-05-17');

    for (const res of [await api(app, 'aurora').get(`/v1/users/${user.id}`)]) {
      expect(res.text).not.toMatch(/password|argon2|birth/i);
    }
  });

  it('senha e data de nascimento não podem ser alteradas pelo PATCH', async () => {
    const user = await createUser(app, 'aurora');
    for (const body of [{ password: 'nova senha sintética' }, { birthDate: '1980-01-01' }, { passwordHash: 'x' }]) {
      expect((await api(app, 'aurora').patch(`/v1/users/${user.id}`, body)).status).toBe(400);
    }
  });
});

describe('login por CPF + senha', () => {
  it('sucesso: devolve token opaco, expiração e o contrato do usuário; guarda só o hash do token', async () => {
    const user = await createUser(app, 'aurora');
    const res = await login('aurora', formatCpf(user.document), SYNTHETIC_PASSWORD);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as LoginResponse;
    expect(body.user).toEqual(user);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const ttl = new Date(body.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(SESSION_TTL_MS - 60_000);
    expect(ttl).toBeLessThanOrEqual(SESSION_TTL_MS);

    const sessions = await asTenant(
      migratorPool,
      auroraId,
      async (c) =>
        (await c.query<{ token_hash: string }>('SELECT token_hash FROM sessions WHERE user_id = $1', [user.id])).rows,
    );
    expect(sessions).toEqual([{ token_hash: createHash('sha256').update(body.token).digest('hex') }]);
  });

  it('senha errada e CPF inexistente têm a mesma resposta', async () => {
    const user = await createUser(app, 'aurora');
    const wrong = await login('aurora', user.document, 'senha errada sintética');
    const unknown = await login('aurora', cpfFrom('123456789'), SYNTHETIC_PASSWORD);
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'CPF ou senha inválidos.' });
    }
  });

  it('login é por banca: o mesmo CPF em outra banca é outra conta, com outra senha', async () => {
    const data = syntheticUser();
    await api(app, 'aurora').post('/v1/users', data).expect(201);
    expect((await login('boreal', data.document, SYNTHETIC_PASSWORD)).status).toBe(401);

    await api(app, 'boreal')
      .post('/v1/users', { ...data, password: 'outra senha da boreal' })
      .expect(201);
    expect((await login('boreal', data.document, SYNTHETIC_PASSWORD)).status).toBe(401);
    expect((await login('boreal', data.document, 'outra senha da boreal')).status).toBe(200);
    expect((await login('aurora', data.document, SYNTHETIC_PASSWORD)).status).toBe(200);
  });

  it('rejeita campos extras e payload inválido', async () => {
    const user = await createUser(app, 'aurora');
    const extra = await api(app, 'aurora').post('/v1/auth/login', {
      document: user.document,
      password: SYNTHETIC_PASSWORD,
      tenantId: auroraId,
    });
    expect(extra.status).toBe(400);
    expect((await api(app, 'aurora').post('/v1/auth/login', { document: user.document })).status).toBe(400);
  });

  it(`bloqueia após ${MAX_FAILURES} falhas, mesmo com a senha certa, e informa Retry-After`, async () => {
    const user = await createUser(app, 'aurora');
    for (let i = 0; i < MAX_FAILURES; i += 1) {
      expect((await login('aurora', user.document, `errada ${i}`)).status).toBe(401);
    }
    const locked = await login('aurora', user.document, SYNTHETIC_PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('TOO_MANY_ATTEMPTS');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);

    // O bloqueio é por banca: o mesmo CPF na boreal não é afetado.
    await api(app, 'boreal')
      .post('/v1/users', { ...syntheticUser(), document: user.document })
      .expect(201);
    expect((await login('boreal', user.document, SYNTHETIC_PASSWORD)).status).toBe(200);
  });

  it('CPF inexistente também é bloqueado (não revela quais CPFs existem)', async () => {
    const unknown = cpfFrom('987654321');
    for (let i = 0; i < MAX_FAILURES; i += 1) await login('aurora', unknown, 'qualquer senha');
    expect((await login('aurora', unknown, 'qualquer senha')).status).toBe(429);
  });

  it('login bem-sucedido zera as falhas acumuladas', async () => {
    const user = await createUser(app, 'aurora');
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) await login('aurora', user.document, 'errada');
    expect((await login('aurora', user.document, SYNTHETIC_PASSWORD)).status).toBe(200);
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) {
      expect((await login('aurora', user.document, 'errada')).status).toBe(401);
    }
  });

  it('falhas guardam só HMAC do CPF, nunca o CPF', async () => {
    const user = await createUser(app, 'aurora');
    await login('aurora', user.document, 'errada');
    const rows = await asTenant(
      migratorPool,
      auroraId,
      async (c) => (await c.query<{ identifier_hash: string }>('SELECT identifier_hash FROM login_failures')).rows,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.identifier_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.identifier_hash).not.toBe(createHash('sha256').update(user.document).digest('hex'));
  });
});

describe('sessão: /v1/me e logout', () => {
  async function loggedIn() {
    const user = await createUser(app, 'aurora');
    const res = await login('aurora', user.document, SYNTHETIC_PASSWORD);
    return { user, token: (res.body as LoginResponse).token };
  }

  it('GET /v1/me devolve o usuário da sessão', async () => {
    const { user, token } = await loggedIn();
    const res = await me('aurora', token);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body as PublicUser).toEqual(user);
  });

  it('sem token, token malformado ou desconhecido: 401 SESSION_INVALID', async () => {
    await loggedIn();
    for (const token of [undefined, '', 'curto', 'A'.repeat(43)]) {
      const res = await me('aurora', token);
      expect(res.status, String(token)).toBe(401);
      expect(res.body.code).toBe('SESSION_INVALID');
    }
  });

  it('token de uma banca não vale em outra', async () => {
    const { token } = await loggedIn();
    const res = await me('boreal', token);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_INVALID');
  });

  it('logout revoga a sessão e é idempotente', async () => {
    const { token } = await loggedIn();
    const out = await api(app, 'aurora').post('/v1/auth/logout', {}).set('X-Session-Token', token);
    expect(out.status).toBe(204);
    expect((await me('aurora', token)).status).toBe(401);
    expect((await api(app, 'aurora').post('/v1/auth/logout', {}).set('X-Session-Token', token)).status).toBe(204);
    expect((await api(app, 'aurora').post('/v1/auth/logout', {})).status).toBe(204);
  });

  it('logout na banca errada não revoga a sessão', async () => {
    const { token } = await loggedIn();
    await api(app, 'boreal').post('/v1/auth/logout', {}).set('X-Session-Token', token).expect(204);
    expect((await me('aurora', token)).status).toBe(200);
  });

  it('sessão expirada é recusada', async () => {
    const { token } = await loggedIn();
    await asTenant(migratorPool, auroraId, (c) =>
      c.query("UPDATE sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 second'"),
    );
    expect((await me('aurora', token)).status).toBe(401);
  });

  it('sessões e falhas de login também são isoladas por RLS', async () => {
    const { token } = await loggedIn();
    await login('aurora', cpfFrom('111222333'), 'errada');
    expect((await runtimePool.query('SELECT id FROM sessions')).rowCount).toBe(0);
    expect((await runtimePool.query('SELECT id FROM login_failures')).rowCount).toBe(0);
    await expect(runtimePool.query('DELETE FROM sessions')).rejects.toMatchObject({ code: '42501' });
    expect((await me('aurora', token)).status).toBe(200);
  });
});
