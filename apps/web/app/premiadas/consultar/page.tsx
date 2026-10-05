import { prizeDates } from '@sysjb/contracts';
import { unauthorized } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { formatCalendarDate } from '@/lib/datetime';
import { resolveRequest } from '@/lib/request-context';
import { prizesOfDate, ROUTES } from '@/lib/routes';
import SectionMenuPage from '@/views/SectionMenuPage';

export const dynamic = 'force-dynamic';

/** Premiadas > Consultar premiadas: escolha do dia (hoje e os 7 anteriores, em Brasília). */
export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  const items = prizeDates(new Date().toISOString()).map((date) => ({
    label: formatCalendarDate(date),
    href: prizesOfDate(date),
  }));

  return (
    <TenantProvider tenant={ctx.tenant}>
      <SectionMenuPage
        tenant={ctx.tenant}
        user={ctx.me}
        menu={{ title: 'Selecione a data', items }}
        back={{ href: ROUTES.prizes, label: 'Voltar para premiadas' }}
      />
    </TenantProvider>
  );
}
