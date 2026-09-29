import { redirect } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { loadDraws } from '@/lib/draws';
import { resolveRequest } from '@/lib/request-context';
import DashboardPage from '@/views/DashboardPage';

export const dynamic = 'force-dynamic';

/** Dashboard do cliente. Sem sessão válida, vai para o login (como o ProtectedRoute original). */
export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) redirect('/login');

  // Sem o cadastro de sorteios, o dashboard abre do mesmo jeito, só sem o banner do próximo sorteio.
  const drawSchedule = await loadDraws(ctx.hostname);

  return (
    <TenantProvider tenant={ctx.tenant}>
      <DashboardPage tenant={ctx.tenant} user={ctx.me} drawSchedule={drawSchedule} nowIso={new Date().toISOString()} />
    </TenantProvider>
  );
}
