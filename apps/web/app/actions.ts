'use server';

import type { CreateUserRequest, PublicUser, UpdateUserRequest } from '@sysjb/contracts';
import { USER_WRITABLE_FIELDS } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { apiRequest } from '@/lib/api-client';
import type { ApiResult } from '@/lib/api-result';
import { demoAllowed, hostnameOnly } from '@/lib/server-env';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function currentHost(): Promise<string | null> {
  const hostname = hostnameOnly((await headers()).get('host'));
  return demoAllowed(hostname) ? hostname : null;
}

function disabled<T>(): ApiResult<T> {
  return { ok: false, status: 404, error: { statusCode: 404, code: 'NOT_FOUND', message: 'Demonstração indisponível.' } };
}

/** Repassa somente os campos editáveis; a API rejeita qualquer outro de todo modo. */
function pickWritable(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of USER_WRITABLE_FIELDS) if (field in input) out[field] = input[field];
  return out;
}

export async function createUserAction(input: CreateUserRequest): Promise<ApiResult<PublicUser>> {
  const host = await currentHost();
  if (!host) return disabled();
  return apiRequest<PublicUser>(host, 'POST', '/v1/users', pickWritable({ ...input }));
}

export async function getUserAction(id: string): Promise<ApiResult<PublicUser>> {
  const host = await currentHost();
  if (!host) return disabled();
  if (!UUID_RE.test(id.trim())) {
    return { ok: false, status: 400, error: { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Informe um UUID válido.' } };
  }
  return apiRequest<PublicUser>(host, 'GET', `/v1/users/${id.trim()}`);
}

export async function updateUserAction(id: string, patch: UpdateUserRequest): Promise<ApiResult<PublicUser>> {
  const host = await currentHost();
  if (!host) return disabled();
  if (!UUID_RE.test(id)) {
    return { ok: false, status: 400, error: { statusCode: 400, code: 'VALIDATION_ERROR', message: 'UUID inválido.' } };
  }
  return apiRequest<PublicUser>(host, 'PATCH', `/v1/users/${id}`, pickWritable({ ...patch }));
}
