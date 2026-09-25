'use server';

import type { PublicUser, UpdateUserRequest } from '@sysjb/contracts';
import { USER_WRITABLE_FIELDS } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { apiRequest } from '@/lib/api-client';
import type { ApiResult } from '@/lib/api-result';
import { demoAllowed, hostnameOnly } from '@/lib/server-env';

/*
 * Ferramentas de demonstração (consulta/edição por UUID). Usam só a credencial de serviço,
 * sem login de administrador, por isso ficam restritas a desenvolvimento em *.localhost.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function demoHost(): Promise<string | null> {
  const hostname = hostnameOnly((await headers()).get('host'));
  return demoAllowed(hostname) ? hostname : null;
}

function disabled<T>(): ApiResult<T> {
  return {
    ok: false,
    status: 404,
    error: { statusCode: 404, code: 'NOT_FOUND', message: 'Demonstração indisponível.' },
  };
}

function invalidId<T>(): ApiResult<T> {
  return {
    ok: false,
    status: 400,
    error: { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Informe um UUID válido.' },
  };
}

export async function getUserAction(id: string): Promise<ApiResult<PublicUser>> {
  const host = await demoHost();
  if (!host) return disabled();
  if (!UUID_RE.test(id.trim())) return invalidId();
  return apiRequest<PublicUser>(host, 'GET', `/v1/users/${id.trim()}`);
}

export async function updateUserAction(id: string, patch: UpdateUserRequest): Promise<ApiResult<PublicUser>> {
  const host = await demoHost();
  if (!host) return disabled();
  if (!UUID_RE.test(id)) return invalidId();
  // Repassa só os campos editáveis; a API rejeita qualquer outro de todo modo.
  const body: Record<string, unknown> = {};
  for (const field of USER_WRITABLE_FIELDS) if (field in patch) body[field] = patch[field];
  return apiRequest<PublicUser>(host, 'PATCH', `/v1/users/${id}`, body);
}
