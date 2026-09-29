import { isReportDate, REPORT_DAYS_BACK } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import PuleList from '@/components/reports/PuleList';
import PlayerShell from '@/components/section/PlayerShell';
import SectionBar from '@/components/section/SectionBar';
import { TenantUnavailable } from '@/components/ui/Notice';
import { loadPules } from '@/lib/reports';
import { resolveRequest } from '@/lib/request-context';
import { ROUTES } from '@/lib/routes';

export const dynamic = 'force-dynamic';

/** Pules vendidas no dia. Data fora do formato ou do período volta para a escolha do dia. */
export default async function Page({ params }: { params: Promise<{ data: string }> }) {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) redirect('/login');

  const { data: date } = await params;
  if (!isReportDate(new Date().toISOString(), date, REPORT_DAYS_BACK.pules)) redirect(ROUTES.puleByDate);

  const data = await loadPules(ctx.hostname, date);
  if (!data) {
    return (
      <TenantUnavailable hostname={ctx.hostname} message="Não foi possível consultar as pules. Tente novamente." />
    );
  }

  return (
    <PlayerShell tenant={ctx.tenant} inviteCode={ctx.me.inviteCode}>
      <SectionBar title="Pules" back={{ href: ROUTES.puleByDate, label: 'Voltar para as datas' }} />
      <main>
        <PuleList data={data} />
      </main>
    </PlayerShell>
  );
}
