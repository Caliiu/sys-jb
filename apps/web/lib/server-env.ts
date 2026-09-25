import 'server-only';
import { existsSync } from 'node:fs';
import path from 'node:path';

let loaded = false;

/** Lê o .env da raiz do monorepo no processo do servidor. Nada daqui chega ao navegador. */
function ensureEnv(): void {
  if (loaded) return;
  loaded = true;
  const rootEnv = path.resolve(process.cwd(), '../../.env');
  if (!process.env.WEB_API_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
}

export function hostnameOnly(host: string | null): string | null {
  if (!host) return null;
  const name = host
    .trim()
    .toLowerCase()
    .replace(/:\d{1,5}$/, '')
    .replace(/\.$/, '');
  return /^[a-z0-9.-]{1,253}$/.test(name) ? name : null;
}

/** A demonstração só existe em desenvolvimento e em hostnames *.localhost. */
export function demoAllowed(hostname: string | null): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return hostname === 'localhost' || (hostname?.endsWith('.localhost') ?? false);
}

export function apiBaseUrl(): string {
  ensureEnv();
  return process.env.WEB_API_URL ?? 'http://127.0.0.1:4000';
}

/** Credencial de serviço da banca, indexada pelo hostname (WEB_SERVICE_KEYS). */
export function serviceKeyFor(hostname: string): string | null {
  ensureEnv();
  for (const pair of (process.env.WEB_SERVICE_KEYS ?? '').split(',')) {
    const eq = pair.indexOf('=');
    if (eq > 0 && pair.slice(0, eq).trim() === hostname) return pair.slice(eq + 1).trim() || null;
  }
  return null;
}
