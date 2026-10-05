import { redirect, unauthorized } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import BrandingEditor from '@/components/admin/BrandingEditor';
import PersonalizationTabs, { firstPersonalizationTab } from '@/components/admin/PersonalizationTabs';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Personalização' };

export default async function Page() {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'branding.read')) {
    // Personalização sem a identidade visual (ex.: Financeiro): abre na primeira aba que o perfil pode ver.
    const tab = firstPersonalizationTab(session.operator.permissions);
    if (tab) redirect(tab.href);
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar a personalização.</AdminMessage>;
  }

  const res = await adminApi.getBranding(session);
  if (!res.ok) {
    const failure = toAdminFailure(res.status, res.error);
    if (failure.code === 'SESSION_INVALID') unauthorized();
    return <AdminMessage title="Não foi possível carregar a identidade visual">{failure.message}</AdminMessage>;
  }

  return (
    <div>
      <AdminPageTitle title="Personalização: Identidade visual" />
      <PersonalizationTabs active="branding" permissions={session.operator.permissions} />
      <BrandingEditor initial={res.data} canManage={can(session.operator, 'branding.manage')} />
    </div>
  );
}
