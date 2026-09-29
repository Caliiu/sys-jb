import { redirect } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { resolveRequest } from '@/lib/request-context';
import { ROUTES } from '@/lib/routes';
import { PULE_LOOKUP_MENU } from '@/lib/section-menus';
import SectionMenuPage from '@/views/SectionMenuPage';

export const dynamic = 'force-dynamic';

/** Relatórios > Consultar pule: por código ou por data. */
export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) redirect('/login');

  return (
    <TenantProvider tenant={ctx.tenant}>
      <SectionMenuPage
        tenant={ctx.tenant}
        user={ctx.me}
        menu={PULE_LOOKUP_MENU}
        back={{ href: ROUTES.reports, label: 'Voltar para relatórios' }}
      />
    </TenantProvider>
  );
}
