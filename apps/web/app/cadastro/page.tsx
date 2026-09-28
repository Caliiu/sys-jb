import { parseInviteRef } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { resolveRequest } from '@/lib/request-context';
import RegisterPage from '@/views/RegisterPage';

export const dynamic = 'force-dynamic';

/**
 * Código do link de convite (`?convite=CDYGE`, ou o ID exibido dos links antigos). Formato inválido é
 * ignorado: o cadastro segue sem convite.
 */
function parseInviteCode(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const ref = value ? parseInviteRef(value) : null;
  if (!ref) return undefined;
  return 'code' in ref ? ref.code : String(ref.displayId);
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (ctx.me) redirect('/');

  return (
    <TenantProvider tenant={ctx.tenant}>
      <RegisterPage inviteCode={parseInviteCode((await searchParams).convite)} />
    </TenantProvider>
  );
}
