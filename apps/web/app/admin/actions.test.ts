import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const apiRequest = vi.fn();
const readOperatorToken = vi.fn();
const headerValues: Record<string, string | null> = { host: 'admin.localhost:3000' };

// Módulos de servidor (cabeçalhos, cookie, chamada HTTP): aqui só interessa o que a action decide e devolve.
vi.mock('next/headers', () => ({ headers: async () => ({ get: (name: string) => headerValues[name] ?? null }) }));
vi.mock('@/lib/api-client', () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));
vi.mock('@/lib/admin/admin-session', () => ({
  readOperatorToken: () => readOperatorToken(),
  writeOperatorToken: vi.fn(),
  clearOperatorToken: vi.fn(),
}));
vi.mock('@/lib/server-env', () => ({
  hostnameOnly: (host: string | null) => (host ? host.replace(/:\d+$/, '') : null),
  isAdminHost: (hostname: string | null) => hostname === 'admin.localhost',
  serviceKeyFor: (hostname: string) => (['admin.localhost', 'aurora.localhost'].includes(hostname) ? 'chave' : null),
}));

const { searchPlayersAction } = await import('./actions');

const TOKEN = 'a'.repeat(43);
const PLAYER = { id: '11111111-1111-4111-8111-111111111111', displayId: 1020, name: 'José Ávila' };

beforeEach(() => {
  vi.clearAllMocks();
  headerValues.host = 'admin.localhost:3000';
  readOperatorToken.mockResolvedValue(TOKEN);
});

describe('searchPlayersAction', () => {
  it('busca na lista de usuários com o token do operador e devolve só id, número e nome', async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { items: [{ ...PLAYER, cpf: '123', balanceCents: 10 }], page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    expect(await searchPlayersAction('  josé ')).toEqual({ ok: true, data: [PLAYER] });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      'admin.localhost',
      'GET',
      '/v1/admin/users?page=1&pageSize=10&search=jos%C3%A9',
      undefined,
      { operatorToken: TOKEN },
    );
  });

  it('rejeita termo curto, longo ou que não é texto, sem chamar a API', async () => {
    for (const input of ['', ' a ', 'x'.repeat(101), 12, null, { search: 'ana' }]) {
      expect(await searchPlayersAction(input), JSON.stringify(input)).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('sem cookie de sessão ou fora do host do painel, não chama a API', async () => {
    readOperatorToken.mockResolvedValue(undefined);
    expect(await searchPlayersAction('ana')).toMatchObject({ code: 'SESSION_INVALID' });
    readOperatorToken.mockResolvedValue(TOKEN);
    headerValues.host = 'aurora.localhost:3000';
    expect(await searchPlayersAction('ana')).toMatchObject({ code: 'TENANT_NOT_FOUND' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('falha da API vira mensagem para o operador', async () => {
    apiRequest.mockResolvedValue({
      ok: false,
      status: 403,
      error: { statusCode: 403, code: 'FORBIDDEN', message: 'x' },
    });
    expect(await searchPlayersAction('ana')).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
