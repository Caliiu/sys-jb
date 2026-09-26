import type { ApiError, ApiErrorCode } from '@sysjb/contracts';

/** Falha já com mensagem pronta para a tela e, quando a API indica, o erro de cada campo. */
export interface AdminFailure {
  ok: false;
  code: ApiErrorCode;
  message: string;
  /** campo -> mensagem (validação e conflitos de cadastro). */
  fieldErrors?: Record<string, string>;
}

/** Resultado serializável das server actions do painel. */
export type AdminActionResult<T = null> = { ok: true; data: T } | AdminFailure;

/** Converte um erro da API em mensagem para o operador, sem expor detalhes técnicos. */
export function toAdminFailure(status: number, error: ApiError): AdminFailure {
  const fieldErrors = error.details?.length
    ? Object.fromEntries(error.details.map((detail) => [detail.field, detail.message]))
    : undefined;

  const failure = (message: string): AdminFailure => ({
    ok: false,
    code: error.code,
    message,
    ...(fieldErrors ? { fieldErrors } : {}),
  });

  if (status >= 500 || error.code === 'UNAUTHORIZED')
    return failure('Serviço indisponível. Tente novamente em instantes.');
  switch (error.code) {
    case 'SESSION_INVALID':
      return failure('Sessão encerrada. Entre novamente.');
    case 'FORBIDDEN':
      return failure('Sem permissão para esta ação.');
    case 'NOT_FOUND':
      return failure('Usuário não encontrado.');
    case 'TOO_MANY_ATTEMPTS':
      return failure('Muitas tentativas. Tente novamente mais tarde.');
    case 'VALIDATION_ERROR':
      return failure('Corrija os campos destacados.');
    default:
      return failure(error.message);
  }
}
