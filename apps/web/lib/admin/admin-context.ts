import 'server-only';
import type { Permission, PublicOperator, PublicTenant } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { apiRequest } from '../api-client';
import { resolveTenant } from '../request-context';
import { ADMIN_ROUTES } from './admin-routes';
import { readOperatorToken } from './admin-session';

export type AdminContext =
  | { ok: true; hostname: string; tenant: PublicTenant; operator: PublicOperator | null; token: string | null }
  | { ok: false; hostname: string | null; message: string };

/** Banca (hostname) e operador logado (cookie de sessão) da requisição. cache(): uma consulta por requisição. */
export const resolveAdminRequest = cache(async (): Promise<AdminContext> => {
  const ctx = await resolveTenant();
  if (!ctx.ok) return ctx;

  const token = (await readOperatorToken()) ?? null;
  const me = token
    ? await apiRequest<PublicOperator>(ctx.hostname, 'GET', '/v1/admin/me', undefined, { operatorToken: token })
    : null;

  return {
    ok: true,
    hostname: ctx.hostname,
    tenant: ctx.tenant,
    operator: me?.ok ? me.data : null,
    token: me?.ok ? token : null,
  };
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
 * Porta de entrada das páginas do painel. Sem operador logado, vai para o login. Cada página chama
 * isto (não só o layout): layouts não rodam de novo a cada navegação, e a API é quem autoriza de fato.
 */
export async function requireAdmin(): Promise<AdminGate> {
  const ctx = await resolveAdminRequest();
  if (!ctx.ok) return ctx;
  if (!ctx.operator || !ctx.token) redirect(ADMIN_ROUTES.login);
  return {
    ok: true,
    session: { hostname: ctx.hostname, tenant: ctx.tenant, operator: ctx.operator, token: ctx.token },
  };
}

export const can = (operator: PublicOperator, permission: Permission): boolean =>
  operator.permissions.includes(permission);
