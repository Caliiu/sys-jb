'use server';

import type {
  AdminPromoterListItem,
  AdminUserDetail,
  AdminUserListItem,
  OperatorLoginResponse,
} from '@sysjb/contracts';
import { MAX_COMMISSION_BPS, MIN_COMMISSION_BPS, USER_STATUSES } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { adminApi } from '@/lib/admin/admin-api';
import { clearOperatorToken, readOperatorToken, writeOperatorToken } from '@/lib/admin/admin-session';
import { type AdminActionResult, type AdminFailure, toAdminFailure } from '@/lib/admin/admin-result';
import { hostnameOnly, isAdminHost, serviceKeyFor } from '@/lib/server-env';

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
  message: 'Painel indisponível neste endereço.',
};

/** Só o host do painel (admin.<domínio>) aceita estas ações; a banca do operador vem da sessão dele. */
async function currentHost(): Promise<string | null> {
  const hostname = hostnameOnly((await headers()).get('host'));
  return hostname && isAdminHost(hostname) && serviceKeyFor(hostname) ? hostname : null;
}

/** Host do painel + token do operador (cookie HttpOnly), ou a falha pronta para devolver. */
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

const commissionSchema = z.number().int().min(MIN_COMMISSION_BPS).max(MAX_COMMISSION_BPS);

/** Promove o usuário a promotor ou altera a comissão (centésimos de %). A API confere a permissão. */
export async function setPromoterAction(
  userId: unknown,
  commissionBps: unknown,
): Promise<AdminActionResult<AdminPromoterListItem>> {
  const id = userIdSchema.safeParse(userId);
  const bps = commissionSchema.safeParse(commissionBps);
  if (!id.success || !bps.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.setPromoter(caller, id.data, bps.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

export async function removePromoterAction(userId: unknown): Promise<AdminActionResult> {
  const id = userIdSchema.safeParse(userId);
  if (!id.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.removePromoter(caller, id.data);
  return res.ok ? { ok: true, data: null } : toAdminFailure(res.status, res.error);
}

const SEARCH_RESULTS = 5;
const searchSchema = z.string().trim().min(2).max(100);

/** Busca de usuários para escolher quem vira promotor: só as primeiras correspondências. */
export async function searchUsersAction(search: unknown): Promise<AdminActionResult<AdminUserListItem[]>> {
  const term = searchSchema.safeParse(search);
  if (!term.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.listUsers(caller, { page: 1, search: term.data, status: '' });
  return res.ok ? { ok: true, data: res.data.items.slice(0, SEARCH_RESULTS) } : toAdminFailure(res.status, res.error);
}
