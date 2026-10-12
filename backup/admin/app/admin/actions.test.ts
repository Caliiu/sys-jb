import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const apiRequest = vi.fn();
const readOperatorToken = vi.fn();
const writeOperatorToken = vi.fn();
const clearOperatorToken = vi.fn();
const headerValues: Record<string, string | null> = { host: 'admin.localhost:3000' };

// Módulos de servidor (cabeçalhos, cookie, chamada HTTP): aqui só interessa o que a action decide e devolve.
vi.mock('next/headers', () => ({ headers: async () => ({ get: (name: string) => headerValues[name] ?? null }) }));
vi.mock('@/lib/api-client', () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));
vi.mock('@/lib/admin/admin-session', () => ({
  readOperatorToken: () => readOperatorToken(),
  writeOperatorToken: (...args: unknown[]) => writeOperatorToken(...args),
  clearOperatorToken: () => clearOperatorToken(),
}));
vi.mock('@/lib/server-env', () => ({
  hostnameOnly: (host: string | null) => (host ? host.replace(/:\d+$/, '') : null),
  isAdminHost: (hostname: string | null) => hostname === 'admin.localhost',
  serviceKeyFor: (hostname: string) => (['admin.localhost', 'aurora.localhost'].includes(hostname) ? 'chave' : null),
}));

const { adminLoginAction, adminLogoutAction, setUserStatusAction, updateUserAction } = await import('./actions');

const TOKEN = 'a'.repeat(43);
const USER_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  headerValues.host = 'admin.localhost:3000';
  readOperatorToken.mockResolvedValue(TOKEN);
});

describe('adminLoginAction', () => {
  it('envia só e-mail e senha ao host do painel (sem banca) e guarda o token no cookie', async () => {
    apiRequest.mockResolvedValue({ ok: true, status: 200, data: { token: TOKEN, expiresAt: '2030-01-01T00:00:00Z' } });
    expect(await adminLoginAction({ email: 'op@example.test', password: 'segredo' })).toEqual({ ok: true, data: null });

    expect(apiRequest).toHaveBeenCalledExactlyOnceWith('admin.localhost', 'POST', '/v1/admin/auth/login', {
      email: 'op@example.test',
      password: 'segredo',
    });
    expect(writeOperatorToken).toHaveBeenCalledExactlyOnceWith(TOKEN, '2030-01-01T00:00:00Z');
  });

  it('não aceita escolher a banca nem campos extras, e não chama a API', async () => {
    for (const input of [
      { email: 'a@b.co', password: 'x', tenant: 'boreal' },
      { email: 'a@b.co' },
      { email: '', password: 'x' },
      { email: 'a@b.co', password: 5 },
      null,
    ]) {
      expect(await adminLoginAction(input), JSON.stringify(input)).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('só funciona no host do painel: o de uma banca ou desconhecido é recusado sem chamar a API', async () => {
    for (const host of ['aurora.localhost:3000', 'desconhecida.localhost', null]) {
      headerValues.host = host;
      expect(await adminLoginAction({ email: 'a@b.co', password: 'x' })).toMatchObject({ ok: false });
    }
    expect(apiRequest).not.toHaveBeenCalled();
    expect(writeOperatorToken).not.toHaveBeenCalled();
  });

  it('credencial recusada: mensagem da API, nada é gravado no cookie', async () => {
    apiRequest.mockResolvedValue({
      ok: false,
      status: 401,
      error: { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' },
    });
    expect(await adminLoginAction({ email: 'a@b.co', password: 'x' })).toMatchObject({
      ok: false,
      code: 'INVALID_CREDENTIALS',
    });
    expect(writeOperatorToken).not.toHaveBeenCalled();
  });
});

describe('ações do painel', () => {
  it('usam o host do painel e o token do cookie', async () => {
    apiRequest.mockResolvedValue({ ok: true, status: 200, data: { id: USER_ID } });
    await setUserStatusAction(USER_ID, 'BLOCKED');
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      'admin.localhost',
      'PATCH',
      `/v1/admin/users/${USER_ID}/status`,
      { status: 'BLOCKED' },
      { operatorToken: TOKEN },
    );
  });

  it('sem cookie de sessão ou fora do host do painel, não chamam a API', async () => {
    readOperatorToken.mockResolvedValue(undefined);
    expect(await updateUserAction(USER_ID, { name: 'Novo Nome' })).toMatchObject({ code: 'SESSION_INVALID' });

    readOperatorToken.mockResolvedValue(TOKEN);
    headerValues.host = 'aurora.localhost:3000';
    expect(await updateUserAction(USER_ID, { name: 'Novo Nome' })).toMatchObject({ code: 'TENANT_NOT_FOUND' });
    expect(await setUserStatusAction(USER_ID, 'BLOCKED')).toMatchObject({ code: 'TENANT_NOT_FOUND' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('rejeitam entrada inválida antes de chamar a API', async () => {
    expect(await setUserStatusAction('não-é-uuid', 'BLOCKED')).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await setUserStatusAction(USER_ID, 'OUTRO')).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await updateUserAction(USER_ID, { tenantId: 'x' })).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await updateUserAction(USER_ID, {})).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('adminLogoutAction', () => {
  it('encerra a sessão na API e sempre limpa o cookie', async () => {
    apiRequest.mockResolvedValue({ ok: true, status: 204, data: null });
    await adminLogoutAction();
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      'admin.localhost',
      'POST',
      '/v1/admin/auth/logout',
      {},
      { operatorToken: TOKEN },
    );
    expect(clearOperatorToken).toHaveBeenCalledOnce();
  });

  it('sem sessão, só limpa o cookie', async () => {
    readOperatorToken.mockResolvedValue(undefined);
    await adminLogoutAction();
    expect(apiRequest).not.toHaveBeenCalled();
    expect(clearOperatorToken).toHaveBeenCalledOnce();
  });
});
