import type { ApiError } from '@sysjb/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
const readSessionToken = vi.fn();
const headerValues: Record<string, string | null> = { host: 'aurora.localhost:3000' };

// Módulos de servidor (cabeçalhos, cookie, chamada HTTP): aqui só interessa o que a action monta e devolve.
vi.mock('next/headers', () => ({ headers: async () => ({ get: (name: string) => headerValues[name] ?? null }) }));
vi.mock('@/lib/api-client', () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));
vi.mock('@/lib/session', () => ({ readSessionToken: () => readSessionToken() }));
vi.mock('@/lib/server-env', () => ({
  hostnameOnly: (host: string | null) => (host ? host.replace(/:\d+$/, '') : null),
  serviceKeyFor: (hostname: string) => (hostname === 'aurora.localhost' ? 'chave' : null),
}));

const { changePasswordAction, updateProfileAction } = await import('./profile-actions');

const TOKEN = 'a'.repeat(43);
const apiError = (statusCode: number, code: ApiError['code'], extra: Partial<ApiError> = {}) => ({
  ok: false as const,
  status: statusCode,
  error: { statusCode, code, message: 'mensagem da API', ...extra },
});

beforeEach(() => {
  vi.clearAllMocks();
  headerValues.host = 'aurora.localhost:3000';
  readSessionToken.mockResolvedValue(TOKEN);
});

describe('updateProfileAction', () => {
  it('envia à API só e-mail/telefone, com a sessão do cookie, e devolve o perfil', async () => {
    apiRequest.mockResolvedValue({ ok: true, status: 200, data: { id: 'u1', email: 'a@example.test' } });
    const result = await updateProfileAction({ email: 'a@example.test', phone: '21987654321' });

    expect(result).toEqual({ ok: true, data: { id: 'u1', email: 'a@example.test' } });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      'aurora.localhost',
      'PATCH',
      '/v1/me',
      { email: 'a@example.test', phone: '21987654321' },
      { sessionToken: TOKEN },
    );
  });

  it('rejeita entrada inválida sem chamar a API (campos extras, tipos errados, vazio)', async () => {
    const invalid = [
      null,
      'x',
      {},
      { name: 'Outro' },
      { document: '123' },
      { email: 5 },
      { phone: 'x'.repeat(33) },
      [],
    ];
    for (const input of invalid) {
      expect(await updateProfileAction(input), JSON.stringify(input)).toMatchObject({
        ok: false,
        code: 'VALIDATION_ERROR',
      });
    }
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('sem cookie de sessão: sessão encerrada, sem chamar a API', async () => {
    readSessionToken.mockResolvedValue(undefined);
    expect(await updateProfileAction({ email: 'a@example.test' })).toMatchObject({
      ok: false,
      code: 'SESSION_INVALID',
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('hostname sem credencial de banca: indisponível, sem chamar a API', async () => {
    headerValues.host = 'desconhecida.localhost';
    expect(await updateProfileAction({ email: 'a@example.test' })).toMatchObject({
      ok: false,
      code: 'TENANT_NOT_FOUND',
    });
    headerValues.host = null;
    expect(await updateProfileAction({ email: 'a@example.test' })).toMatchObject({ ok: false });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('conflito: mensagem da API e o erro de cada campo (sem valores)', async () => {
    apiRequest.mockResolvedValue(
      apiError(409, 'CONFLICT', {
        message: 'Email já cadastrado nesta banca.',
        details: [{ field: 'email', message: 'Já cadastrado.' }],
      }),
    );
    expect(await updateProfileAction({ email: 'a@example.test' })).toEqual({
      ok: false,
      code: 'CONFLICT',
      message: 'Email já cadastrado nesta banca.',
      fieldErrors: { email: 'Já cadastrado.' },
    });
  });

  it('validação da API vira "Corrija os campos destacados" com os campos', async () => {
    apiRequest.mockResolvedValue(
      apiError(400, 'VALIDATION_ERROR', { details: [{ field: 'phone', message: 'Telefone inválido.' }] }),
    );
    expect(await updateProfileAction({ phone: '123' })).toEqual({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Corrija os campos destacados.',
      fieldErrors: { phone: 'Telefone inválido.' },
    });
  });

  it('sessão expirada, erro de servidor e credencial de serviço têm mensagens seguras', async () => {
    apiRequest.mockResolvedValue(apiError(401, 'SESSION_INVALID'));
    expect(await updateProfileAction({ email: 'a@example.test' })).toMatchObject({
      code: 'SESSION_INVALID',
      message: 'Sessão encerrada. Entre novamente.',
    });

    for (const failure of [
      apiError(500, 'INTERNAL_ERROR'),
      apiError(401, 'UNAUTHORIZED'),
      apiError(403, 'FORBIDDEN'),
    ]) {
      apiRequest.mockResolvedValue(failure);
      expect(await updateProfileAction({ email: 'a@example.test' })).toMatchObject({
        message: 'Serviço indisponível. Tente novamente em instantes.',
      });
    }
  });
});

describe('changePasswordAction', () => {
  it('envia só a senha nova, com a sessão do cookie', async () => {
    apiRequest.mockResolvedValue({ ok: true, status: 204, data: null });
    expect(await changePasswordAction({ password: 'uma frase totalmente nova 2026' })).toEqual({
      ok: true,
      data: null,
    });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      'aurora.localhost',
      'POST',
      '/v1/me/password',
      { password: 'uma frase totalmente nova 2026' },
      { sessionToken: TOKEN },
    );
  });

  it('rejeita entrada inválida sem chamar a API', async () => {
    const invalid = [
      null,
      {},
      { password: '' },
      { password: 123 },
      { password: 'x'.repeat(129) },
      { password: 'ok', currentPassword: 'x' },
    ];
    for (const input of invalid) {
      expect(await changePasswordAction(input), JSON.stringify(input)).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('senha recusada pela API: o erro vai para o campo da senha', async () => {
    apiRequest.mockResolvedValue(
      apiError(400, 'VALIDATION_ERROR', { details: [{ field: 'password', message: 'Senha muito comum.' }] }),
    );
    expect(await changePasswordAction({ password: 'senha123' })).toMatchObject({
      ok: false,
      fieldErrors: { password: 'Senha muito comum.' },
    });
  });

  it('sem sessão, não chama a API', async () => {
    readSessionToken.mockResolvedValue(undefined);
    expect(await changePasswordAction({ password: 'uma frase totalmente nova 2026' })).toMatchObject({
      code: 'SESSION_INVALID',
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
