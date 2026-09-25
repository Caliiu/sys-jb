import type { ApiError } from '@sysjb/contracts';

/** Resultado serializável das chamadas à API (usado por server actions e pelo cliente). */
export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiError };
