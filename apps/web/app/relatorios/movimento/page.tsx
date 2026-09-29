import { REPORT_DAYS_BACK, reportDates } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { formatCalendarDate } from '@/lib/datetime';
import { resolveRequest } from '@/lib/request-context';
import { movementOfDate, ROUTES } from '@/lib/routes';
import SectionMenuPage from '@/views/SectionMenuPage';

export const dynamic = 'force-dynamic';

/** Relatórios > Movimento loterias: escolha do dia (hoje e os 7 anteriores, em Brasília). */
export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) redirect('/login');

  const items = reportDates(new Date().toISOString(), REPORT_DAYS_BACK.lotteryMovement).map((date) => ({
    label: formatCalendarDate(date),
    href: movementOfDate(date),
  }));

  return (
    <TenantProvider tenant={ctx.tenant}>
      <SectionMenuPage
        tenant={ctx.tenant}
        user={ctx.me}
        menu={{ title: 'Selecione a data', items }}
        back={{ href: ROUTES.reports, label: 'Voltar para relatórios' }}
      />
    </TenantProvider>
  );
}
