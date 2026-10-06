import { unauthorized } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import PaymentsPage from '@/views/admin/PaymentsPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pagamentos' };

/** Configurações > Pagamentos: consulta com `payments.read`; gravar, testar e ativar, só com `payments.manage`. */
export default async function Page() {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'payments.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar os pagamentos.</AdminMessage>;
  }

  const [res, withdrawals] = await Promise.all([
    adminApi.getPaymentSettings(session),
    adminApi.getWithdrawalSettings(session),
  ]);
  if (!res.ok) {
    const failure = toAdminFailure(res.status, res.error);
    if (failure.code === 'SESSION_INVALID') unauthorized();
    return <AdminMessage title="Não foi possível carregar os pagamentos">{failure.message}</AdminMessage>;
  }

  return (
    <PaymentsPage
      settings={res.data}
      withdrawals={withdrawals.ok ? withdrawals.data : null}
      canManage={can(session.operator, 'payments.manage')}
    />
  );
}
