import type { PublicTenant } from '@sysjb/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const apiRequest = vi.fn();
vi.mock('./api-client', () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));

const { TENANT_CACHE_TTL_MS, invalidateTenantCache, loadTenant } = await import('./tenant-cache');

const TENANT: PublicTenant = {
  name: 'Banca Teste',
  slug: 'teste',
  logoUrl: null,
  primaryColor: '#DF2120',
  secondaryColor: '#F4F1EA',
  inviteBarText: 'Indique um amigo e ganhe bônus',
  inviteBarEnabled: true,
  supportPhone: null,
};
const ok = (data: PublicTenant = TENANT) => ({ ok: true, status: 200, data });

let clock = 1_000_000;
const now = () => clock;

beforeEach(() => {
  apiRequest.mockReset();
  invalidateTenantCache();
  clock = 1_000_000;
});

describe('cache dos dados públicos da banca', () => {
  it('pede à API uma vez e reaproveita até vencer', async () => {
    apiRequest.mockResolvedValue(ok());
    expect(await loadTenant('a.test', now)).toEqual(ok());
    clock += TENANT_CACHE_TTL_MS - 1;
    expect(await loadTenant('a.test', now)).toEqual(ok());
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith('a.test', 'GET', '/v1/tenant');

    clock += 1;
    await loadTenant('a.test', now);
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('cada hostname tem a sua entrada (nunca mistura bancas)', async () => {
    apiRequest.mockImplementation(async (hostname: string) => ok({ ...TENANT, name: `Banca ${hostname}` }));
    expect(await loadTenant('a.test', now)).toMatchObject({ data: { name: 'Banca a.test' } });
    expect(await loadTenant('b.test', now)).toMatchObject({ data: { name: 'Banca b.test' } });
    expect(await loadTenant('a.test', now)).toMatchObject({ data: { name: 'Banca a.test' } });
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('falha, banca inexistente ou inativa não ficam em cache', async () => {
    const notFound = { ok: false, status: 404, error: { statusCode: 404, code: 'TENANT_NOT_FOUND', message: 'x' } };
    apiRequest.mockResolvedValueOnce(notFound).mockResolvedValueOnce(ok());
    expect(await loadTenant('a.test', now)).toEqual(notFound);
    expect(await loadTenant('a.test', now)).toEqual(ok());
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('banca que deixa de existir sai do cache quando ele vence', async () => {
    const gone = { ok: false, status: 404, error: { statusCode: 404, code: 'TENANT_NOT_FOUND', message: 'x' } };
    apiRequest.mockResolvedValueOnce(ok()).mockResolvedValueOnce(gone).mockResolvedValueOnce(gone);
    await loadTenant('a.test', now);
    clock += TENANT_CACHE_TTL_MS;
    expect(await loadTenant('a.test', now)).toEqual(gone);
    expect(await loadTenant('a.test', now)).toEqual(gone);
    expect(apiRequest).toHaveBeenCalledTimes(3);
  });

  it('pedidos simultâneos com o cache vazio fazem uma chamada só', async () => {
    let release: (value: unknown) => void = () => {};
    apiRequest.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const pending = Promise.all([loadTenant('a.test', now), loadTenant('a.test', now), loadTenant('a.test', now)]);
    release(ok());
    expect(await pending).toEqual([ok(), ok(), ok()]);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('alteração no painel limpa o cache na hora', async () => {
    apiRequest.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok({ ...TENANT, name: 'Nome Novo' }));
    await loadTenant('a.test', now);
    invalidateTenantCache();
    expect(await loadTenant('a.test', now)).toMatchObject({ data: { name: 'Nome Novo' } });
  });

  it('busca iniciada antes de uma alteração no painel não grava os dados antigos', async () => {
    let release: (value: unknown) => void = () => {};
    apiRequest.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const stale = loadTenant('a.test', now);
    invalidateTenantCache();
    release(ok());
    expect(await stale).toEqual(ok());

    apiRequest.mockResolvedValueOnce(ok({ ...TENANT, name: 'Nome Novo' }));
    expect(await loadTenant('a.test', now)).toMatchObject({ data: { name: 'Nome Novo' } });
    expect(await loadTenant('a.test', now)).toMatchObject({ data: { name: 'Nome Novo' } });
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('o que fica guardado não pode ser alterado por quem lê', async () => {
    apiRequest.mockResolvedValue(ok());
    const first = await loadTenant('a.test', now);
    expect(() => {
      if (first.ok) (first.data as { name: string }).name = 'Outro';
    }).toThrow(TypeError);
    expect(await loadTenant('a.test', now)).toMatchObject({ data: { name: 'Banca Teste' } });
  });
});
