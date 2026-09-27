import { redirect } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { resolveRequest } from '@/lib/request-context';
import RegisterPage from '@/views/RegisterPage';

export const dynamic = 'force-dynamic';

/** Código do link de convite (`?convite=`): só dígitos; outro formato é ignorado (o cadastro segue sem convite). */
function parseInviteCode(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^\d{1,10}$/.test(value) ? value : undefined;
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
