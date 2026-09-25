import 'server-only';
import type { PublicTenant, PublicUser } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { cache } from 'react';
import { apiRequest } from './api-client';
import { hostnameOnly, serviceKeyFor } from './server-env';
import { readSessionToken } from './session';

export type RequestContext =
  | { ok: true; hostname: string; tenant: PublicTenant; me: PublicUser | null }
  | { ok: false; hostname: string | null; message: string };

/**
 * Banca (pelo hostname) e cliente logado (pelo cookie de sessão) da requisição atual.
 * cache(): layout (metadata) e página compartilham o mesmo resultado na mesma requisição.
 */
export const resolveRequest = cache(async (): Promise<RequestContext> => {
  const hostname = hostnameOnly((await headers()).get('host'));
  if (!hostname || !serviceKeyFor(hostname)) {
    return { ok: false, hostname, message: 'Nenhuma banca configurada para este endereço.' };
  }

  const tenant = await apiRequest<PublicTenant>(hostname, 'GET', '/v1/tenant');
  if (!tenant.ok) return { ok: false, hostname, message: tenant.error.message };

  const sessionToken = await readSessionToken();
  const me = sessionToken ? await apiRequest<PublicUser>(hostname, 'GET', '/v1/me', undefined, { sessionToken }) : null;

  return { ok: true, hostname, tenant: tenant.data, me: me?.ok ? me.data : null };
});
