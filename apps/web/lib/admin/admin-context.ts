import 'server-only';
import type { OperatorMeResponse, Permission, PublicOperator, PublicTenant } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { redirect, unauthorized } from 'next/navigation';
import { cache } from 'react';
import { apiRequest } from '../api-client';
import { hostnameOnly, isAdminHost, serviceKeyFor } from '../server-env';
import { ADMIN_ROUTES } from './admin-routes';
import { readOperatorToken } from './admin-session';
import { REQUEST_PATH_HEADER, isEntryPath } from '../request-path';

export type AdminContext =
  | { ok: true; hostname: string; me: OperatorMeResponse | null; token: string | null }
  | { ok: false; hostname: string | null; message: string };

/**
 * Operador logado (cookie de sessão) e a banca dele. O painel é único: a banca não vem do endereço,
 * vem do operador (a API a resolve pela sessão). cache(): uma consulta por requisição.
 */
export const resolveAdminRequest = cache(async (): Promise<AdminContext> => {
  const hostname = hostnameOnly((await headers()).get('host'));
  if (!hostname || !isAdminHost(hostname) || !serviceKeyFor(hostname)) {
    return { ok: false, hostname, message: 'O painel administrativo não está disponível neste endereço.' };
  }

  const token = (await readOperatorToken()) ?? null;
  const me = token
    ? await apiRequest<OperatorMeResponse>(hostname, 'GET', '/v1/admin/me', undefined, { operatorToken: token })
    : null;

  return { ok: true, hostname, me: me?.ok ? me.data : null, token: me?.ok ? token : null };
});

/** Sessão do operador já validada, para chamar a API em nome dele. */
export interface AdminSession {
  hostname: string;
  tenant: PublicTenant;
  operator: PublicOperator;
  token: string;
}

export type AdminGate = { ok: true; session: AdminSession } | { ok: false; hostname: string | null; message: string };

/**
 * Porta de entrada das páginas do painel. Sem operador logado: a entrada do painel (/) vai para o login; qualquer
 * outra página mostra o 401 (unauthorized.tsx), com o atalho para entrar. Cada página chama
 * isto (não só o layout): layouts não rodam de novo a cada navegação, e a API é quem autoriza de fato.
 */
export async function requireAdmin(): Promise<AdminGate> {
  const ctx = await resolveAdminRequest();
  if (!ctx.ok) return ctx;
  if (!ctx.me || !ctx.token) {
    if (isEntryPath((await headers()).get(REQUEST_PATH_HEADER))) redirect(ADMIN_ROUTES.login);
    unauthorized();
  }
  return {
    ok: true,
    session: { hostname: ctx.hostname, tenant: ctx.me.tenant, operator: ctx.me.operator, token: ctx.token },
  };
}

export const can = (operator: PublicOperator, permission: Permission): boolean =>
  operator.permissions.includes(permission);
