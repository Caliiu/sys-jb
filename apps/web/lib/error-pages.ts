import 'server-only';
import type { PublicTenant } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { resolveTenant } from './request-context';
import { hostnameOnly, isAdminHost } from './server-env';

/** Para quem é a página de erro: o painel (admin.<domínio>), uma banca, ou ninguém (endereço sem banca). */
export type ErrorAudience = { kind: 'admin' } | { kind: 'tenant'; tenant: PublicTenant } | { kind: 'none' };

export async function errorAudience(): Promise<ErrorAudience> {
  const hostname = hostnameOnly((await headers()).get('host'));
  if (isAdminHost(hostname)) return { kind: 'admin' };
  const ctx = await resolveTenant();
  return ctx.ok ? { kind: 'tenant', tenant: ctx.tenant } : { kind: 'none' };
}
