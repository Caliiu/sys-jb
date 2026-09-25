import type { ApiError, ApiErrorCode } from '@sysjb/contracts';

/** Erro com resposta pública padronizada. A mensagem nunca deve conter dados pessoais. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: ApiError['details'],
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
  internal: () => new AppError(500, 'INTERNAL_ERROR', 'Erro interno.'),
};
