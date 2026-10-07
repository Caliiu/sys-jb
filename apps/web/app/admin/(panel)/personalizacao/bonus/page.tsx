import { unauthorized } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import DepositBonusSettingsCard from '@/components/admin/DepositBonusSettingsCard';
import PersonalizationTabs from '@/components/admin/PersonalizationTabs';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Personalização' };

/** Personalização > Bônus: o bônus de recarga de Loterias (consulta com `commissions.read`; alterar só o Gerente). */
export default async function Page() {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'commissions.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar o bônus de recarga.</AdminMessage>;
  }

  const settings = await adminApi.getDepositBonusSettings(session);
  if (!settings.ok) {
    const failure = toAdminFailure(settings.status, settings.error);
    if (failure.code === 'SESSION_INVALID') unauthorized();
    return <AdminMessage title="Não foi possível carregar o bônus de recarga">{failure.message}</AdminMessage>;
  }

  return (
    <div>
      <AdminPageTitle title="Personalização: Bônus" />
      <PersonalizationTabs active="bonus" permissions={session.operator.permissions} />
      <DepositBonusSettingsCard settings={settings.data} canManage={can(session.operator, 'commissions.manage')} />
    </div>
  );
}
