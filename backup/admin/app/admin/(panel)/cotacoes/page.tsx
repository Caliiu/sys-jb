import { unauthorized } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import QuotesEditor from '@/components/admin/QuotesEditor';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cotações' };

export default async function Page() {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'quotes.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar as cotações.</AdminMessage>;
  }

  const res = await adminApi.getQuotes(session);
  if (!res.ok) {
    const failure = toAdminFailure(res.status, res.error);
    if (failure.code === 'SESSION_INVALID') unauthorized();
    return <AdminMessage title="Não foi possível carregar as cotações">{failure.message}</AdminMessage>;
  }

  return (
    <div>
      <h1 className="mb-4 text-[18px] font-bold text-admin-text">Cotações</h1>
      <QuotesEditor quotes={res.data} canManage={can(session.operator, 'quotes.manage')} />
    </div>
  );
}
