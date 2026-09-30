import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type RateLimitConfig, loadRateLimitConfig } from '../rate-limit/rate-limit.rules.js';
import { type HoroscopeConfig, loadHoroscopeConfig } from '../horoscope/horoscope.config.js';
import { parseResultsWebhookToken } from '../results/results.config.js';

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
  /** SHA-256 da credencial do painel administrativo (admin.<domínio>); null = painel desativado. */
  adminKeyDigest: Buffer | null;
  /** Chave HMAC para pseudonimizar o CPF no controle de tentativas de login (e o IP no limite de requisições). */
  authSecret: string;
  /** Limite de requisições (RATE_LIMIT_ENABLED e RATE_LIMIT_<REGRA>). */
  rateLimit: RateLimitConfig;
  /** SHA-256 do token do webhook de resultados (RESULTS_WEBHOOK_TOKEN); null = webhook desativado. */
  resultsWebhookTokenDigest: Buffer | null;
  /** API de horóscopo (HOROSCOPE_API_*); null = desligada (a tela usa o texto local). */
  horoscope: HoroscopeConfig | null;
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

/** Credencial do painel: mesmo tamanho mínimo das outras e nunca igual à de uma banca. Vazia = painel desativado. */
export function parseAdminKey(raw: string | undefined, tenantKeys: ServiceKeyEntry[]): Buffer | null {
  const key = raw?.trim();
  if (!key) return null;
  if (key.length < MIN_SERVICE_KEY_LENGTH) {
    throw new Error(`ADMIN_SERVICE_KEY: precisa de ao menos ${MIN_SERVICE_KEY_LENGTH} caracteres`);
  }
  const digest = digestKey(key);
  if (tenantKeys.some((entry) => entry.digest.equals(digest))) {
    throw new Error('ADMIN_SERVICE_KEY: não pode ser igual à credencial de uma banca');
  }
  return digest;
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
  ADMIN_SERVICE_KEY: z.string().optional(),
  AUTH_SECRET: z.string().min(MIN_SERVICE_KEY_LENGTH),
});

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuração inválida: ${fields}`);
  }
  const e = parsed.data;
  const serviceKeys = parseServiceKeys(e.TENANT_SERVICE_KEYS);
  return {
    host: e.API_HOST,
    port: e.API_PORT,
    trustProxy: parseTrustProxy(e.API_TRUST_PROXY),
    databaseUrl: e.DATABASE_URL,
    dbPoolMax: e.DB_POOL_MAX,
    serviceKeys,
    adminKeyDigest: parseAdminKey(e.ADMIN_SERVICE_KEY, serviceKeys),
    authSecret: e.AUTH_SECRET,
    rateLimit: loadRateLimitConfig(env),
    resultsWebhookTokenDigest: parseResultsWebhookToken(env.RESULTS_WEBHOOK_TOKEN),
    horoscope: loadHoroscopeConfig(env),
  };
}
