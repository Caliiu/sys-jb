import type { ApiError } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { toAdminFailure } from './admin-result';

const apiError = (code: ApiError['code'], statusCode: number, extra: Partial<ApiError> = {}): ApiError => ({
  statusCode,
  code,
  message: 'mensagem técnica da API',
  ...extra,
});

describe('toAdminFailure', () => {
  it('erro de servidor ou de credencial de serviço vira mensagem genérica (sem detalhe técnico)', () => {
    const cases: Array<[number, ApiError]> = [
      [500, apiError('INTERNAL_ERROR', 500)],
      [502, apiError('INTERNAL_ERROR', 502)],
      [401, apiError('UNAUTHORIZED', 401)],
    ];
    for (const [status, error] of cases) {
      expect(toAdminFailure(status, error).message).toBe('Serviço indisponível. Tente novamente em instantes.');
    }
  });

  it('traduz os erros que o operador pode resolver', () => {
    expect(toAdminFailure(401, apiError('SESSION_INVALID', 401))).toMatchObject({
      code: 'SESSION_INVALID',
      message: 'Sessão encerrada. Entre novamente.',
    });
    expect(toAdminFailure(403, apiError('FORBIDDEN', 403)).message).toBe('Sem permissão para esta ação.');
    expect(toAdminFailure(404, apiError('NOT_FOUND', 404)).message).toBe('Usuário não encontrado.');
    expect(toAdminFailure(429, apiError('TOO_MANY_ATTEMPTS', 429)).message).toBe(
      'Muitas tentativas. Tente novamente mais tarde.',
    );
  });

  it('login inválido mantém a mensagem da API', () => {
    const error = apiError('INVALID_CREDENTIALS', 401, { message: 'E-mail ou senha inválidos.' });
    expect(toAdminFailure(401, error).message).toBe('E-mail ou senha inválidos.');
  });

  it('validação e conflito trazem o erro de cada campo', () => {
    const details = [{ field: 'document', message: 'Já cadastrado.' }];
    expect(toAdminFailure(400, apiError('VALIDATION_ERROR', 400, { details }))).toEqual({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Corrija os campos destacados.',
      fieldErrors: { document: 'Já cadastrado.' },
    });
    const conflict = apiError('CONFLICT', 409, { message: 'CPF já cadastrado nesta banca.', details });
    expect(toAdminFailure(409, conflict)).toMatchObject({
      message: 'CPF já cadastrado nesta banca.',
      fieldErrors: { document: 'Já cadastrado.' },
    });
  });
});
