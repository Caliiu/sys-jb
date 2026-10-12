'use server';

import type { OperatorLoginResponse } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { adminApi } from '@/lib/admin/admin-api';
import { type AdminActionResult, type AdminFailure, toAdminFailure } from '@/lib/admin/admin-result';
import { clearOperatorToken, readOperatorToken, writeOperatorToken } from '@/lib/admin/admin-session';
import { hostnameOnly, isAdminHost, serviceKeyFor } from '@/lib/server-env';

/**
 * Ações do painel. Server action é endpoint público: toda ação confere o formato da entrada e,
 * principalmente, a API valida a sessão do operador e a permissão do perfil a cada chamada.
 * As ações das telas antigas estão em backup/admin/app/admin/actions.ts e voltam conforme as telas forem portadas.
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

/** Apostador nas opções dos filtros (ex.: Pules Registradas). */
export interface PlayerOption {
  id: string;
  displayId: number;
  name: string;
}

const PLAYER_SEARCH_RESULTS = 10;
const playerSearchSchema = z.string().trim().min(2).max(100);

/** Busca de apostadores para os filtros (nome, CPF, telefone ou ID): as primeiras correspondências. */
export async function searchPlayersAction(search: unknown): Promise<AdminActionResult<PlayerOption[]>> {
  const term = playerSearchSchema.safeParse(search);
  if (!term.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.listUsers(caller, {
    page: 1,
    pageSize: PLAYER_SEARCH_RESULTS,
    search: term.data,
    status: '',
    promoterId: '',
  });
  return res.ok
    ? { ok: true, data: res.data.items.map(({ id, displayId, name }) => ({ id, displayId, name })) }
    : toAdminFailure(res.status, res.error);
}
