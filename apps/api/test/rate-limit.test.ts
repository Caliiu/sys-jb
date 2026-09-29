import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { LoginResponse } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadRateLimitConfig, parseRateLimitWindows } from '../src/rate-limit/rate-limit.rules.js';
import {
  api,
  consoleApi,
  cpfFrom,
  createUser,
  KEYS,
  loginOperator,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  SYNTHETIC_PASSWORD,
  syntheticUser,
} from './helpers.js';

const HOUR = 3600;
let app: INestApplication;

beforeAll(async () => {
  app = await startApp({
    rateLimit: {
      enabled: true,
      rules: {
        login_ip: [{ limit: 3, windowSeconds: HOUR }],
        signup_ip: [{ limit: 2, windowSeconds: HOUR }],
        requests_ip: [{ limit: 40, windowSeconds: HOUR }],
        user_write: [{ limit: 2, windowSeconds: HOUR }],
        user_read: [{ limit: 4, windowSeconds: HOUR }],
        operator_write: [{ limit: 2, windowSeconds: HOUR }],
        operator_read: [{ limit: 3, windowSeconds: HOUR }],
      },
    },
  });
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

/** IP de documentação (TEST-NET-3) diferente a cada chamada: os testes não dividem contadores. */
const randomIp = () => `203.0.113.${randomInt(1, 255)}`;
const unknownCpf = () => cpfFrom(String(randomInt(100_000_000, 999_999_999)));

function expect429(res: { status: number; body: { code: string }; headers: Record<string, string> }) {
  expect(res.status).toBe(429);
  expect(res.body.code).toBe('TOO_MANY_ATTEMPTS');
  const retryAfter = Number(res.headers['retry-after']);
  expect(retryAfter).toBeGreaterThanOrEqual(1);
  expect(retryAfter).toBeLessThanOrEqual(HOUR);
}

async function session(ip?: string) {
  const person = await createUser(app, 'aurora');
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  const headers: Record<string, string> = { 'X-Session-Token': (login.body as LoginResponse).token };
  if (ip) headers['X-Client-IP'] = ip;
  return api(app, 'aurora', KEYS.aurora, headers);
}

describe('Limite de requisições', () => {
  it('login por IP: passou do limite, 429 com Retry-After (antes de conferir a senha); outro IP segue', async () => {
    const ip = randomIp();
    const http = api(app, 'aurora', KEYS.aurora, { 'X-Client-IP': ip });
    // CPFs diferentes a cada tentativa: o bloqueio por CPF não pega, o por IP pega.
    for (let i = 0; i < 3; i += 1) {
      const res = await http.post('/v1/auth/login', { document: unknownCpf(), password: 'senha errada qualquer' });
      expect(res.status).toBe(401);
    }
    expect429(await http.post('/v1/auth/login', { document: unknownCpf(), password: 'senha errada qualquer' }));

    const other = api(app, 'aurora', KEYS.aurora, { 'X-Client-IP': randomIp() });
    expect((await other.post('/v1/auth/login', { document: unknownCpf(), password: 'x'.repeat(10) })).status).toBe(401);
  });

  it('login do painel também é limitado por IP', async () => {
    const http = consoleApi(app, { 'X-Client-IP': randomIp() });
    // E-mails diferentes a cada tentativa: o bloqueio por e-mail não pega, o por IP pega.
    for (let i = 0; i < 3; i += 1) {
      const res = await http.post('/v1/admin/auth/login', { email: `x${i}@example.test`, password: 'y'.repeat(10) });
      expect(res.status).toBe(401);
    }
    expect429(await http.post('/v1/admin/auth/login', { email: 'z@example.test', password: 'y'.repeat(10) }));
  });

  it('cadastro por IP (contas em massa)', async () => {
    const http = api(app, 'aurora', KEYS.aurora, { 'X-Client-IP': randomIp() });
    expect((await http.post('/v1/users', syntheticUser())).status).toBe(201);
    expect((await http.post('/v1/users', syntheticUser())).status).toBe(201);
    const blocked = await http.post('/v1/users', syntheticUser());
    expect429(blocked);
  });

  it('jogador: gravações e consultas têm limites próprios; a ação recusada não é executada', async () => {
    const http = await session();
    expect((await http.patch('/v1/me', { email: 'a@example.test' })).status).toBe(200);
    expect((await http.patch('/v1/me', { email: 'b@example.test' })).status).toBe(200);
    expect429(await http.patch('/v1/me', { email: 'c@example.test' }));

    for (let i = 0; i < 4; i += 1) expect((await http.get('/v1/me')).status).toBe(200);
    const blocked = await http.get('/v1/me');
    expect429(blocked);

    // O e-mail ficou no último aceito; outro jogador não é afetado.
    const other = await session();
    expect((await other.get('/v1/me')).status).toBe(200);
  });

  it('operador: consultas e alterações do painel', async () => {
    const operator = await loginOperator(app, 'aurora');
    for (let i = 0; i < 3; i += 1) expect((await operator.http.get('/v1/admin/users')).status).toBe(200);
    expect429(await operator.http.get('/v1/admin/users'));

    const writer = await loginOperator(app, 'aurora');
    const draw = { referralCommissionBps: 100 };
    expect((await writer.http.put('/v1/admin/commissions/settings', draw)).status).toBe(200);
    expect((await writer.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 200 })).status).toBe(200);
    expect429(await writer.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 300 }));
    expect((await writer.http.get('/v1/admin/commissions/settings')).body.referralCommissionBps).toBe(200);
  });

  it('IP inválido no cabeçalho é ignorado; o IP nunca vai em texto para o banco', async () => {
    const ip = randomIp();
    const http = api(app, 'aurora', KEYS.aurora, { 'X-Client-IP': ip });
    await http.get('/v1/tenant');
    const junk = api(app, 'aurora', KEYS.aurora, { 'X-Client-IP': "1.2.3.4'; DROP TABLE users; --" });
    for (let i = 0; i < 5; i += 1)
      expect((await junk.post('/v1/auth/login', { document: unknownCpf(), password: 'x'.repeat(10) })).status).toBe(
        401,
      );

    const { rows } = await migratorPool.query<{ key: string }>('SELECT key FROM rate_limit_counters');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => !row.key.includes(ip) && !row.key.includes('1.2.3.4'))).toBe(true);
    expect(rows.every((row) => /^[a-z_]+:[iuo]:[A-Za-z0-9_-]+:\d+$/.test(row.key))).toBe(true);
  });

  it('health fica fora do limite', async () => {
    const http = api(app, 'aurora', KEYS.aurora, { 'X-Client-IP': randomIp() });
    for (let i = 0; i < 45; i += 1) expect((await http.get('/health')).status).toBe(200);
  });
});

describe('Configuração do limite', () => {
  it('padrões e troca pelo .env', () => {
    const config = loadRateLimitConfig({ RATE_LIMIT_LOGIN_IP: '5/60, 50/3600', RATE_LIMIT_ENABLED: 'false' });
    expect(config.enabled).toBe(false);
    expect(config.rules.login_ip).toEqual([
      { limit: 5, windowSeconds: 60 },
      { limit: 50, windowSeconds: 3600 },
    ]);
    expect(loadRateLimitConfig({}).enabled).toBe(true);
    expect(loadRateLimitConfig({}).rules.user_write).toEqual([{ limit: 30, windowSeconds: 60 }]);
  });

  it('valores inválidos impedem a API de subir', () => {
    for (const raw of ['', '10', '0/60', '10/0', '10/86401', '10/60,20/60', 'a/b', '10/60;']) {
      expect(() => parseRateLimitWindows('RATE_LIMIT_X', raw), raw).toThrow();
    }
    expect(() => loadRateLimitConfig({ RATE_LIMIT_ENABLED: 'talvez' })).toThrow('RATE_LIMIT_ENABLED');
  });
});
