import 'server-only';
import type { PublicTenant, PublicUser } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { cache } from 'react';
import { apiRequest } from './api-client';
import { hostnameOnly, serviceKeyFor } from './server-env';
import { readSessionToken } from './session';

export type TenantContext =
  { ok: true; hostname: string; tenant: PublicTenant } | { ok: false; hostname: string | null; message: string };

export type RequestContext =
  | { ok: true; hostname: string; tenant: PublicTenant; me: PublicUser | null }
  | { ok: false; hostname: string | null; message: string };

/**
 * Banca da requisição, resolvida pelo hostname. Compartilhada pelo app do cliente e pelo painel
 * administrativo. cache(): layout (metadata) e página usam o mesmo resultado na mesma requisição.
 */
export const resolveTenant = cache(async (): Promise<TenantContext> => {
  const hostname = hostnameOnly((await headers()).get('host'));
  if (!hostname || !serviceKeyFor(hostname)) {
    return { ok: false, hostname, message: 'Nenhuma banca configurada para este endereço.' };
  }

  const tenant = await apiRequest<PublicTenant>(hostname, 'GET', '/v1/tenant');
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
