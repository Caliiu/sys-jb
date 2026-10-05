import { isPrizeDate } from '@sysjb/contracts';
import { redirect, unauthorized } from 'next/navigation';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import PrizesScreen from '@/components/prizes/PrizesScreen';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { brandStyle } from '@/lib/brand-style';
import { loadPrizes } from '@/lib/prizes';
import { resolveRequest } from '@/lib/request-context';
import { ROUTES } from '@/lib/routes';

export const dynamic = 'force-dynamic';

/** Premiadas do jogador no dia. Data fora do formato ou do período de consulta volta para a escolha do dia. */
export default async function Page({ params }: { params: Promise<{ data: string }> }) {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  const { data: date } = await params;
  const nowIso = new Date().toISOString();
  if (!isPrizeDate(nowIso, date)) redirect(ROUTES.prizesCheck);

  const report = await loadPrizes(ctx.hostname, date);
  if (!report) {
    return (
      <TenantUnavailable hostname={ctx.hostname} message="Não foi possível consultar as premiadas. Tente novamente." />
    );
  }

  return (
    <TenantProvider tenant={ctx.tenant}>
      <div style={brandStyle(ctx.tenant)} className="app-shell flex flex-col bg-white font-body">
        <InviteProvider inviteCode={ctx.me.inviteCode}>
          <PrizesScreen report={report} sellerId={ctx.me.displayId} nowIso={nowIso} />
        </InviteProvider>
      </div>
    </TenantProvider>
  );
}
