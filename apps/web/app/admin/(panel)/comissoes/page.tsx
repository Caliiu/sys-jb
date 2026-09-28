import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { parseCommissionMonth, recentMonths } from '@/lib/admin/commissions-query';
import CommissionsPage from '@/views/admin/CommissionsPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Comissões' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'commissions.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar comissões.</AdminMessage>;
  }

  const nowIso = new Date().toISOString();
  const month = parseCommissionMonth(await searchParams, nowIso);
  const [settings, data, closings] = await Promise.all([
    adminApi.getCommissionSettings(session),
    adminApi.getCommissionMonth(session, month),
    adminApi.listCommissionClosings(session),
  ]);
  const failed = [settings, data, closings].find((res) => !res.ok);
  if (failed && !failed.ok) {
    const failure = toAdminFailure(failed.status, failed.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    return <AdminMessage title="Não foi possível carregar as comissões">{failure.message}</AdminMessage>;
  }
  if (!settings.ok || !data.ok || !closings.ok) return null;

  // O mês escolhido entra no seletor mesmo se for mais antigo que os 12 meses listados.
  const months = recentMonths(nowIso);
  if (!months.includes(month)) months.push(month);

  return (
    <CommissionsPage
      settings={settings.data}
      data={data.data}
      closings={closings.data}
      months={months}
      canManage={can(session.operator, 'commissions.manage')}
    />
  );
}
