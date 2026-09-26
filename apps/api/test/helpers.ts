import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { OperatorLoginResponse, OperatorRole, PublicUser } from '@sysjb/contracts';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createApp } from '../src/app.factory.js';
import { PasswordService } from '../src/auth/password.service.js';
import { type AppConfig, parseServiceKeys } from '../src/config/config.js';
import { TEST_APP_URL, TEST_MIGRATOR_URL, TEST_TENANTS } from './env.js';

type TenantSlug = keyof typeof TEST_TENANTS;

/** Chaves geradas por execução; nunca reaproveitam as do .env. */
export const KEYS: Record<TenantSlug, string> = {
  aurora: randomBytes(24).toString('hex'),
  boreal: randomBytes(24).toString('hex'),
  cometa: randomBytes(24).toString('hex'),
};

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    trustProxy: false,
    databaseUrl: TEST_APP_URL,
    dbPoolMax: 5,
    serviceKeys: parseServiceKeys(
      Object.entries(KEYS)
        .map(([slug, key]) => `${slug}=${key}`)
        .join(','),
    ),
    authSecret: randomBytes(24).toString('hex'),
    ...overrides,
  };
}

export async function startApp(overrides: Partial<AppConfig> = {}): Promise<INestApplication> {
  const app = await createApp(testConfig(overrides), false);
  // Porta efêmera: o supertest reutiliza o servidor em vez de abrir um por requisição.
  await app.listen(0, '127.0.0.1');
  return app;
}

/** Cliente HTTP já com Host e credencial da banca informada. */
export function api(
  app: INestApplication,
  tenant: TenantSlug,
  key: string = KEYS[tenant],
  extraHeaders: Record<string, string> = {},
) {
  const server = app.getHttpServer() as App;
  const host = TEST_TENANTS[tenant].domain;
  const auth = { Host: host, Authorization: `Bearer ${key}`, ...extraHeaders };
  return {
    post: (path: string, body: unknown) =>
      request(server)
        .post(path)
        .set(auth)
        .send(body as object),
    get: (path: string) => request(server).get(path).set(auth),
    patch: (path: string, body: unknown) =>
      request(server)
        .patch(path)
        .set(auth)
        .send(body as object),
    raw: () => request(server),
  };
}

/** Completa 9 dígitos-base com os dígitos verificadores do CPF (dados sintéticos). */
export function cpfFrom(base9: string): string {
  const d = base9.split('').map(Number);
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += d[i]! * (length + 1 - i);
    d.push(((sum * 10) % 11) % 10);
  }
  return d.join('');
}

export const formatCpf = (cpf: string) => `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

export const SYNTHETIC_PASSWORD = 'correct horse battery staple';

const runBase = String(10_000 + Math.floor(Math.random() * 90_000));
let seq = 0;
/** Dados sintéticos únicos por execução, sem relação com pessoas reais. */
export function syntheticUser(extra: Record<string, unknown> = {}) {
  seq += 1;
  return {
    name: `Pessoa Sintética ${seq}`,
    phone: `119${runBase}${String(seq).padStart(3, '0')}`,
    document: cpfFrom(`8${runBase}${String(seq).padStart(3, '0')}`),
    birthDate: '1990-05-17',
    password: SYNTHETIC_PASSWORD,
    ...extra,
  };
}

export const migratorPool = new pg.Pool({ connectionString: TEST_MIGRATOR_URL, max: 3 });
export const runtimePool = new pg.Pool({ connectionString: TEST_APP_URL, max: 3 });

export async function tenantId(slug: TenantSlug): Promise<string> {
  const { rows } = await migratorPool.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [slug]);
  if (!rows[0]) throw new Error(`banca ${slug} ausente`);
  return rows[0].id;
}

/** TRUNCATE não é afetado por RLS; a role de migração é dona das tabelas. */
export async function resetUsers(): Promise<void> {
  await migratorPool.query(
    'TRUNCATE audit_logs, operator_sessions, operators, sessions, login_failures, wallets, users',
  );
}

/** Consulta como dona das tabelas, mas com contexto de banca (FORCE RLS também se aplica a ela). */
export async function asTenant<T>(pool: pg.Pool, id: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [id]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createUser(app: INestApplication, tenant: TenantSlug, extra: Record<string, unknown> = {}) {
  const res = await api(app, tenant).post('/v1/users', syntheticUser(extra));
  if (res.status !== 201) throw new Error(`cadastro falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as PublicUser;
}

export const OPERATOR_PASSWORD = 'operator horse battery staple';
const passwords = new PasswordService();
let operatorSeq = 0;

/** Cria um operador (só a credencial de migração pode: a role de runtime não tem INSERT em operators). */
export async function createOperator(
  tenant: TenantSlug,
  options: { role?: OperatorRole; active?: boolean; email?: string } = {},
) {
  operatorSeq += 1;
  const email = options.email ?? `operador${operatorSeq}.${runBase}@example.test`;
  const passwordHash = await passwords.hash(OPERATOR_PASSWORD);
  const id = await tenantId(tenant);
  await asTenant(migratorPool, id, (client) =>
    client.query(
      `INSERT INTO operators (tenant_id, name, email, password_hash, role, active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [id, `Operador Sintético ${operatorSeq}`, email, passwordHash, options.role ?? 'MANAGER', options.active ?? true],
    ),
  );
  return { email, password: OPERATOR_PASSWORD };
}

/** Cria o operador, faz login e devolve um cliente HTTP já autenticado como ele. */
export async function loginOperator(app: INestApplication, tenant: TenantSlug, options: { role?: OperatorRole } = {}) {
  const { email, password } = await createOperator(tenant, options);
  const res = await api(app, tenant).post('/v1/admin/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`login do operador falhou: ${res.status} ${JSON.stringify(res.body)}`);
  const session = res.body as OperatorLoginResponse;
  return { ...session, email, http: api(app, tenant, KEYS[tenant], { 'X-Operator-Token': session.token }) };
}
