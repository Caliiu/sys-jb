import { createHash } from 'node:crypto';
import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface ServiceKeyEntry {
  tenantSlug: string;
  /** SHA-256 da chave; o texto da chave não fica na configuração carregada. */
  digest: Buffer;
}

export interface AppConfig {
  host: string;
  port: number;
  /** Valor repassado ao "trust proxy" do Express. false = ignora X-Forwarded-*. */
  trustProxy: false | string;
  databaseUrl: string;
  dbPoolMax: number;
  serviceKeys: ServiceKeyEntry[];
  /** Chave HMAC para pseudonimizar o CPF no controle de tentativas de login. */
  authSecret: string;
}

export const MIN_SERVICE_KEY_LENGTH = 32;

export function digestKey(key: string): Buffer {
  return createHash('sha256').update(key, 'utf8').digest();
}

/** Formato: "slug=chave,slug2=chave2". */
export function parseServiceKeys(raw: string): ServiceKeyEntry[] {
  const entries: ServiceKeyEntry[] = [];
  const seenSlugs = new Set<string>();
  const seenKeys = new Set<string>();

  for (const part of raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const eq = part.indexOf('=');
    const slug = eq > 0 ? part.slice(0, eq).trim() : '';
    const key = eq > 0 ? part.slice(eq + 1).trim() : '';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      throw new Error('TENANT_SERVICE_KEYS: slug inválido');
    }
    if (key.length < MIN_SERVICE_KEY_LENGTH) {
      throw new Error(
        `TENANT_SERVICE_KEYS: a chave da banca "${slug}" precisa de ao menos ${MIN_SERVICE_KEY_LENGTH} caracteres`,
      );
    }
    if (seenSlugs.has(slug)) throw new Error(`TENANT_SERVICE_KEYS: banca "${slug}" repetida`);
    if (seenKeys.has(key)) throw new Error('TENANT_SERVICE_KEYS: a mesma chave não pode servir a duas bancas');
    seenSlugs.add(slug);
    seenKeys.add(key);
    entries.push({ tenantSlug: slug, digest: digestKey(key) });
  }

  if (entries.length === 0) throw new Error('TENANT_SERVICE_KEYS: nenhuma credencial configurada');
  return entries;
}

function parseTrustProxy(raw: string): false | string {
  if (raw === 'false' || raw === '') return false;
  if (raw === 'true') {
    throw new Error('API_TRUST_PROXY=true confia em qualquer origem; informe endereços explícitos (ex.: "loopback")');
  }
  return raw;
}

const envSchema = z.object({
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_TRUST_PROXY: z.string().default('false'),
  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  TENANT_SERVICE_KEYS: z.string().min(1),
  AUTH_SECRET: z.string().min(MIN_SERVICE_KEY_LENGTH),
});

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuração inválida: ${fields}`);
  }
  const e = parsed.data;
  return {
    host: e.API_HOST,
    port: e.API_PORT,
    trustProxy: parseTrustProxy(e.API_TRUST_PROXY),
    databaseUrl: e.DATABASE_URL,
    dbPoolMax: e.DB_POOL_MAX,
    serviceKeys: parseServiceKeys(e.TENANT_SERVICE_KEYS),
    authSecret: e.AUTH_SECRET,
  };
}
