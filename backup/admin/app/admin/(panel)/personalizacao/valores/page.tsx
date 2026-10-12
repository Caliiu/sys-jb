import { unauthorized } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import PersonalizationTabs from '@/components/admin/PersonalizationTabs';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import ValuesPage from '@/views/admin/ValuesPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Personalização' };

/** Personalização > Valores: o percentual do "Indique e ganhe". */
export default async function Page() {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'commissions.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar os valores.</AdminMessage>;
  }

  const settings = await adminApi.getCommissionSettings(session);
  if (!settings.ok) {
    const failure = toAdminFailure(settings.status, settings.error);
    if (failure.code === 'SESSION_INVALID') unauthorized();
    return <AdminMessage title="Não foi possível carregar os valores">{failure.message}</AdminMessage>;
  }

  return (
    <div>
      <AdminPageTitle title="Personalização: Valores" />
      <PersonalizationTabs active="values" permissions={session.operator.permissions} />
      <ValuesPage settings={settings.data} canManage={can(session.operator, 'commissions.manage')} />
    </div>
  );
}
