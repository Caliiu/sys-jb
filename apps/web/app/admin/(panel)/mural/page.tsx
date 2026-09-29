import { drawDateOf } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import MuralsManager from '@/components/admin/MuralsManager';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mural' };

export default async function Page() {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'murals.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar o mural.</AdminMessage>;
  }

  const res = await adminApi.listMurals(session);
  if (!res.ok) {
    const failure = toAdminFailure(res.status, res.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    return <AdminMessage title="Não foi possível carregar o mural">{failure.message}</AdminMessage>;
  }

  return (
    <div>
      <h1 className="mb-4 text-[18px] font-bold text-admin-text">Mural</h1>
      <MuralsManager
        initial={res.data}
        canManage={can(session.operator, 'murals.manage')}
        today={drawDateOf(new Date().toISOString(), 0)}
        tenant={session.tenant}
      />
    </div>
  );
}
