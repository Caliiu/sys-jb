import { redirect } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { resolveRequest } from '@/lib/request-context';
import RechargePage from '@/views/RechargePage';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) redirect('/login');

  return (
    <TenantProvider tenant={ctx.tenant}>
      <RechargePage tenant={ctx.tenant} user={ctx.me} />
    </TenantProvider>
  );
}
