import { notFound, redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { TenantUnavailable } from '@/components/ui/Notice';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import UserDetailPage from '@/views/admin/UserDetailPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Usuário' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return <TenantUnavailable hostname={gate.hostname} message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'users.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar usuários.</AdminMessage>;
  }

  const { id } = await params;
  const res = await adminApi.getUser(session, id);
  if (!res.ok) {
    // 400 = id que nem é UUID; para o operador é o mesmo que não existir.
    if (res.status === 404 || res.status === 400) notFound();
    const failure = toAdminFailure(res.status, res.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    return (
      <AdminMessage title="Não foi possível carregar o usuário" backToUsers>
        {failure.message}
      </AdminMessage>
    );
  }

  return (
    <UserDetailPage
      user={res.data}
      canEdit={can(session.operator, 'users.update')}
      canChangeStatus={can(session.operator, 'users.status')}
    />
  );
}
