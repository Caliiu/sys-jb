'use server';

import type { ApiError as ApiErrorBody, ApiErrorCode, LoginResponse, PublicUser } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { apiRequest } from '@/lib/api-client';
import { hostnameOnly, serviceKeyFor } from '@/lib/server-env';
import { clearSessionToken, readSessionToken, writeSessionToken } from '@/lib/session';

/**
 * Ações de cadastro/login do cliente. Diferente das ferramentas de demonstração,
 * valem em qualquer ambiente, desde que o hostname tenha credencial configurada.
 */
export type AuthResult = { ok: true } | { ok: false; status: number; code: ApiErrorCode; message: string };

export interface RegisterInput {
  name: string;
  cpf: string;
  phone: string;
  birthDate: string;
  password: string;
}

export interface LoginInput {
  cpf: string;
  password: string;
}

async function authHost(): Promise<string | null> {
  const hostname = hostnameOnly((await headers()).get('host'));
  return hostname && serviceKeyFor(hostname) ? hostname : null;
}

const unavailable: AuthResult = {
  ok: false,
  status: 404,
  code: 'TENANT_NOT_FOUND',
  message: 'Banca indisponível neste endereço.',
};

/** Mensagem pronta para a tela: o detalhe do campo quando houver, senão a mensagem da API. */
function toAuthError(status: number, error: ApiErrorBody): AuthResult {
  const detail = status === 400 ? error.details?.[0]?.message : undefined;
  const message =
    status >= 500 || error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN'
      ? 'Serviço indisponível. Tente novamente em instantes.'
      : (detail ?? error.message);
  return { ok: false, status, code: error.code, message };
}

export async function registerAction(input: RegisterInput): Promise<AuthResult> {
  const host = await authHost();
  if (!host) return unavailable;
  const res = await apiRequest<PublicUser>(host, 'POST', '/v1/users', {
    name: input.name,
    phone: input.phone,
    document: input.cpf,
    birthDate: input.birthDate,
    password: input.password,
  });
  return res.ok ? { ok: true } : toAuthError(res.status, res.error);
}

/** O token fica só no cookie HttpOnly; o navegador não o recebe. */
export async function loginAction(input: LoginInput): Promise<AuthResult> {
  const host = await authHost();
  if (!host) return unavailable;
  const res = await apiRequest<LoginResponse>(host, 'POST', '/v1/auth/login', {
    document: input.cpf,
    password: input.password,
  });
  if (!res.ok) return toAuthError(res.status, res.error);
  await writeSessionToken(res.data.token, res.data.expiresAt);
  return { ok: true };
}

/** Usuário da sessão atual (usado para atualizar o saldo no dashboard). */
export async function meAction(): Promise<{ ok: true; user: PublicUser } | Extract<AuthResult, { ok: false }>> {
  const host = await authHost();
  const token = await readSessionToken();
  if (!host) return unavailable as Extract<AuthResult, { ok: false }>;
  if (!token) return { ok: false, status: 401, code: 'SESSION_INVALID', message: 'Sessão encerrada.' };
  const res = await apiRequest<PublicUser>(host, 'GET', '/v1/me', undefined, { sessionToken: token });
  return res.ok
    ? { ok: true, user: res.data }
    : (toAuthError(res.status, res.error) as Extract<AuthResult, { ok: false }>);
}

export async function logoutAction(): Promise<void> {
  const host = await authHost();
  const token = await readSessionToken();
  if (host && token) await apiRequest<null>(host, 'POST', '/v1/auth/logout', {}, { sessionToken: token });
  await clearSessionToken();
}
