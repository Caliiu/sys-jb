import type { ApiError, ApiErrorCode } from '@sysjb/contracts';

/** Erro com resposta pública padronizada. A mensagem nunca deve conter dados pessoais. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: ApiError['details'],
    /** Headers extras da resposta (ex.: Retry-After). */
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  toResponse(): ApiError {
    const body: ApiError = { statusCode: this.statusCode, code: this.code, message: this.message };
    if (this.details?.length) body.details = this.details;
    return body;
  }
}

export const Errors = {
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', 'Credencial de serviço ausente ou inválida.'),
  forbidden: () => new AppError(403, 'FORBIDDEN', 'Credencial não autorizada para esta banca.'),
  tenantNotFound: () => new AppError(404, 'TENANT_NOT_FOUND', 'Banca não encontrada para este hostname.'),
  userNotFound: () => new AppError(404, 'NOT_FOUND', 'Usuário não encontrado.'),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'CPF ou senha inválidos.'),
  invalidOperatorCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.'),
  accountBlocked: () => new AppError(403, 'ACCOUNT_BLOCKED', 'Conta bloqueada. Entre em contato com o suporte.'),
  permissionDenied: () => new AppError(403, 'FORBIDDEN', 'Sem permissão para esta ação.'),
  sessionInvalid: () => new AppError(401, 'SESSION_INVALID', 'Sessão ausente, expirada ou encerrada.'),
  tooManyAttempts: (retryAfterSeconds: number) =>
    new AppError(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas. Tente novamente mais tarde.', undefined, {
      'Retry-After': String(retryAfterSeconds),
    }),
  internal: () => new AppError(500, 'INTERNAL_ERROR', 'Erro interno.'),
};
