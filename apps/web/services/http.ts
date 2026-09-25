import type { ApiErrorCode } from '@sysjb/contracts';

/** Erro de API já com mensagem pronta para exibir ao usuário. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
