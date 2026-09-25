import { redirect } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { resolveRequest } from '@/lib/request-context';
import DashboardPage from '@/views/DashboardPage';

export const dynamic = 'force-dynamic';

/** Dashboard do cliente. Sem sessão válida, vai para o login (como o ProtectedRoute original). */
export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) redirect('/login');

  return (
    <TenantProvider tenant={ctx.tenant}>
      <DashboardPage tenant={ctx.tenant} user={ctx.me} />
    </TenantProvider>
  );
}
