import 'server-only';
import type { PublicTenant, PublicUser } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { cache } from 'react';
import { apiRequest } from './api-client';
import { hostnameOnly, isAdminHost, serviceKeyFor } from './server-env';
import { readSessionToken } from './session';
import { loadTenant } from './tenant-cache';

export type TenantContext =
  { ok: true; hostname: string; tenant: PublicTenant } | { ok: false; hostname: string | null; message: string };

export type RequestContext =
  | { ok: true; hostname: string; tenant: PublicTenant; me: PublicUser | null }
  | { ok: false; hostname: string | null; message: string };

/**
 * Banca da requisição, resolvida pelo hostname (só o app do cliente; o painel administrativo
 * descobre a banca pelo operador logado). cache(): layout (metadata) e página usam o mesmo resultado na mesma requisição.
 */
export const resolveTenant = cache(async (): Promise<TenantContext> => {
  const hostname = hostnameOnly((await headers()).get('host'));
  // O painel administrativo (admin.<domínio>) não é uma banca: nada a resolver, nem chamada à API.
  if (isAdminHost(hostname)) return { ok: false, hostname, message: 'Endereço do painel administrativo.' };
  if (!hostname || !serviceKeyFor(hostname)) {
    return { ok: false, hostname, message: 'Nenhuma banca configurada para este endereço.' };
  }

  // Dados públicos da banca: guardados alguns segundos (lib/tenant-cache), não pedidos à API em toda página.
  const tenant = await loadTenant(hostname);
  if (!tenant.ok) return { ok: false, hostname, message: tenant.error.message };

  return { ok: true, hostname, tenant: tenant.data };
});

/** Banca (pelo hostname) e cliente logado (pelo cookie de sessão) da requisição atual. */
export const resolveRequest = cache(async (): Promise<RequestContext> => {
  const ctx = await resolveTenant();
  if (!ctx.ok) return ctx;

  const sessionToken = await readSessionToken();
  const me = sessionToken
    ? await apiRequest<PublicUser>(ctx.hostname, 'GET', '/v1/me', undefined, { sessionToken })
    : null;

  return { ok: true, hostname: ctx.hostname, tenant: ctx.tenant, me: me?.ok ? me.data : null };
});
