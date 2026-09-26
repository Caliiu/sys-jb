'use server';

import type { AdminUserDetail, OperatorLoginResponse } from '@sysjb/contracts';
import { USER_STATUSES } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { adminApi } from '@/lib/admin/admin-api';
import { clearOperatorToken, readOperatorToken, writeOperatorToken } from '@/lib/admin/admin-session';
import { type AdminActionResult, type AdminFailure, toAdminFailure } from '@/lib/admin/admin-result';
import { hostnameOnly, serviceKeyFor } from '@/lib/server-env';

/**
 * Ações do painel. Server action é endpoint público: toda ação confere o formato da entrada e,
 * principalmente, a API valida a sessão do operador e a permissão do perfil a cada chamada.
 */

const invalidInput: AdminFailure = { ok: false, code: 'VALIDATION_ERROR', message: 'Dados inválidos.' };
const sessionEnded: AdminFailure = {
  ok: false,
  code: 'SESSION_INVALID',
  message: 'Sessão encerrada. Entre novamente.',
};
const unavailable: AdminFailure = {
  ok: false,
  code: 'TENANT_NOT_FOUND',
  message: 'Banca indisponível neste endereço.',
};

async function currentHost(): Promise<string | null> {
  const hostname = hostnameOnly((await headers()).get('host'));
  return hostname && serviceKeyFor(hostname) ? hostname : null;
}

/** Host da banca + token do operador (cookie HttpOnly), ou a falha pronta para devolver. */
async function operatorCaller(): Promise<{ hostname: string; token: string } | AdminFailure> {
  const hostname = await currentHost();
  if (!hostname) return unavailable;
  const token = await readOperatorToken();
  return token ? { hostname, token } : sessionEnded;
}

const isFailure = (value: object): value is AdminFailure => 'ok' in value;

const loginSchema = z.strictObject({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});

/** O token fica só no cookie HttpOnly; o navegador não o recebe. */
export async function adminLoginAction(input: unknown): Promise<AdminActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return invalidInput;
  const hostname = await currentHost();
  if (!hostname) return unavailable;

  const res = await apiRequest<OperatorLoginResponse>(hostname, 'POST', '/v1/admin/auth/login', parsed.data);
  if (!res.ok) return toAdminFailure(res.status, res.error);
  await writeOperatorToken(res.data.token, res.data.expiresAt);
  return { ok: true, data: null };
}

export async function adminLogoutAction(): Promise<void> {
  const hostname = await currentHost();
  const token = await readOperatorToken();
  if (hostname && token) {
    await apiRequest<null>(hostname, 'POST', '/v1/admin/auth/logout', {}, { operatorToken: token });
  }
  await clearOperatorToken();
}

const userIdSchema = z.uuid();

// Só o formato: as regras de CPF, telefone e e-mail são da API (uma fonte de verdade).
const profileSchema = z
  .strictObject({
    name: z.string().max(200).optional(),
    email: z.string().max(254).nullable().optional(),
    phone: z.string().max(32).optional(),
    document: z.string().max(32).optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined));

export async function updateUserAction(userId: unknown, patch: unknown): Promise<AdminActionResult<AdminUserDetail>> {
  const id = userIdSchema.safeParse(userId);
  const body = profileSchema.safeParse(patch);
  if (!id.success || !body.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.updateUser(caller, id.data, body.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

export async function setUserStatusAction(
  userId: unknown,
  status: unknown,
): Promise<AdminActionResult<AdminUserDetail>> {
  const id = userIdSchema.safeParse(userId);
  const next = z.enum(USER_STATUSES).safeParse(status);
  if (!id.success || !next.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.setUserStatus(caller, id.data, next.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}
