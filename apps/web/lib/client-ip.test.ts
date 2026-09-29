import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
let forwardedFor: string | null = null;
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => (name === 'x-forwarded-for' ? forwardedFor : null) }),
}));

const { clientIp } = await import('./client-ip');

afterEach(() => {
  forwardedFor = null;
  vi.unstubAllEnvs();
});

const ipFor = async (header: string | null, hops?: string) => {
  forwardedFor = header;
  if (hops !== undefined) vi.stubEnv('WEB_TRUSTED_PROXY_HOPS', hops);
  return clientIp();
};

describe('IP do visitante (limite de requisições)', () => {
  it('um proxy (padrão): o último endereço, acrescentado pelo nginx', async () => {
    expect(await ipFor('203.0.113.7')).toBe('203.0.113.7');
    // O que o visitante mandou à esquerda é ignorado: não dá para forjar outro IP.
    expect(await ipFor('1.1.1.1, 8.8.8.8, 203.0.113.7')).toBe('203.0.113.7');
  });

  it('dois proxies (CDN + nginx): o penúltimo', async () => {
    expect(await ipFor('6.6.6.6, 203.0.113.7, 198.51.100.2', '2')).toBe('203.0.113.7');
    // Menos entradas do que proxies: sem IP confiável.
    expect(await ipFor('203.0.113.7', '2')).toBeNull();
  });

  it('IPv6 e porta', async () => {
    expect(await ipFor('2001:db8::1')).toBe('2001:db8::1');
    expect(await ipFor('[2001:db8::1]:443')).toBe('2001:db8::1');
    expect(await ipFor('203.0.113.7:51234')).toBe('203.0.113.7');
  });

  it('sem cabeçalho, valor inválido ou 0 proxies: sem IP', async () => {
    expect(await ipFor(null)).toBeNull();
    expect(await ipFor('')).toBeNull();
    expect(await ipFor("1.2.3.4'; DROP TABLE users; --")).toBeNull();
    expect(await ipFor('unknown')).toBeNull();
    expect(await ipFor('203.0.113.7', '0')).toBeNull();
    // Configuração inválida volta ao padrão (1).
    expect(await ipFor('203.0.113.7', 'abc')).toBe('203.0.113.7');
  });
});
