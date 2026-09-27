import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { adminHostname, hostnameOnly, isAdminHost, serviceKeyFor } = await import('./server-env');

const saved = {
  admin: process.env.WEB_ADMIN_HOSTNAME,
  keys: process.env.WEB_SERVICE_KEYS,
  api: process.env.WEB_API_URL,
};

beforeEach(() => {
  // Com WEB_API_URL definida, o .env da raiz não é lido: o teste controla o ambiente.
  process.env.WEB_API_URL = 'http://127.0.0.1:4000';
  delete process.env.WEB_ADMIN_HOSTNAME;
  process.env.WEB_SERVICE_KEYS = 'aurora.localhost=chave-aurora,admin.localhost=chave-admin';
});

afterEach(() => {
  for (const [name, value] of [
    ['WEB_ADMIN_HOSTNAME', saved.admin],
    ['WEB_SERVICE_KEYS', saved.keys],
    ['WEB_API_URL', saved.api],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('hostname do painel administrativo', () => {
  it('padrão admin.localhost; WEB_ADMIN_HOSTNAME sobrescreve (normalizado)', () => {
    expect(adminHostname()).toBe('admin.localhost');
    process.env.WEB_ADMIN_HOSTNAME = ' Admin.Exemplo.com.br:443 ';
    expect(adminHostname()).toBe('admin.exemplo.com.br');
    process.env.WEB_ADMIN_HOSTNAME = '   ';
    expect(adminHostname()).toBe('admin.localhost');
  });

  it('só o host do painel é o painel (a porta não conta; bancas e vazio não)', () => {
    expect(isAdminHost(hostnameOnly('admin.localhost:3000'))).toBe(true);
    expect(isAdminHost(hostnameOnly('ADMIN.localhost'))).toBe(true);
    expect(isAdminHost(hostnameOnly('aurora.localhost:3000'))).toBe(false);
    expect(isAdminHost(hostnameOnly('admin.localhost.evil.com'))).toBe(false);
    expect(isAdminHost(hostnameOnly('xadmin.localhost'))).toBe(false);
    expect(isAdminHost(hostnameOnly(null))).toBe(false);
    expect(isAdminHost(null)).toBe(false);
  });

  it('a credencial do painel vem da mesma lista de chaves, pelo hostname', () => {
    expect(serviceKeyFor('admin.localhost')).toBe('chave-admin');
    expect(serviceKeyFor('aurora.localhost')).toBe('chave-aurora');
  });
});
