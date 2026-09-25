import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PublicUser } from '@sysjb/contracts';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createApp } from '../src/app.factory.js';
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
    serviceKeys: parseServiceKeys(Object.entries(KEYS).map(([slug, key]) => `${slug}=${key}`).join(',')),
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
export function api(app: INestApplication, tenant: TenantSlug, key: string = KEYS[tenant]) {
  const server = app.getHttpServer() as App;
  const host = TEST_TENANTS[tenant].domain;
  const auth = { Host: host, Authorization: `Bearer ${key}` };
  return {
    post: (path: string, body: unknown) => request(server).post(path).set(auth).send(body as object),
    get: (path: string) => request(server).get(path).set(auth),
    patch: (path: string, body: unknown) => request(server).patch(path).set(auth).send(body as object),
    raw: () => request(server),
  };
}

const runBase = String(10_000 + Math.floor(Math.random() * 90_000));
let seq = 0;
/** Dados sintéticos únicos por execução, sem relação com pessoas reais. */
export function syntheticUser(extra: Record<string, unknown> = {}) {
  seq += 1;
  return {
    name: `Pessoa Sintética ${seq}`,
    phone: `119${runBase}${String(seq).padStart(3, '0')}`,
    document: `8${runBase}${String(seq).padStart(5, '0')}`,
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
  await migratorPool.query('TRUNCATE wallets, users');
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
