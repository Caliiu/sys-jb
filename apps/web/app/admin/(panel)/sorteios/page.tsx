import { drawDateOf } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import DrawsManager from '@/components/admin/DrawsManager';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sorteios' };

export default async function Page() {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'draws.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar os sorteios.</AdminMessage>;
  }

  const res = await adminApi.listDraws(session);
  if (!res.ok) {
    const failure = toAdminFailure(res.status, res.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    return <AdminMessage title="Não foi possível carregar os sorteios">{failure.message}</AdminMessage>;
  }

  return (
    <div>
      <h1 className="mb-4 text-[18px] font-bold text-admin-text">Sorteios</h1>
      <DrawsManager
        initial={res.data}
        canManage={can(session.operator, 'draws.manage')}
        today={drawDateOf(new Date().toISOString(), 0)}
      />
    </div>
  );
}
