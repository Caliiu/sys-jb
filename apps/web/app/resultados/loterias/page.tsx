import { RESULTS_DAYS_BACK, reportDates } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { formatCalendarDate } from '@/lib/datetime';
import { resolveRequest } from '@/lib/request-context';
import { resultsOfDate, ROUTES } from '@/lib/routes';
import SectionMenuPage from '@/views/SectionMenuPage';

export const dynamic = 'force-dynamic';

/** Resultados > Resultado loterias: escolha do dia (hoje e os 7 anteriores, em Brasília). */
export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) redirect('/login');

  const items = reportDates(new Date().toISOString(), RESULTS_DAYS_BACK).map((date) => ({
    label: formatCalendarDate(date),
    href: resultsOfDate(date),
  }));

  return (
    <TenantProvider tenant={ctx.tenant}>
      <SectionMenuPage
        tenant={ctx.tenant}
        user={ctx.me}
        menu={{ title: 'Resultados', items }}
        back={{ href: ROUTES.results, label: 'Voltar para resultados' }}
      />
    </TenantProvider>
  );
}
