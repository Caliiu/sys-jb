import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { TenantUnavailable } from '@/components/ui/Notice';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { parseUsersQuery, usersHref } from '@/lib/admin/users-query';
import UsersPage from '@/views/admin/UsersPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Usuários' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <TenantUnavailable hostname={gate.hostname} message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'users.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar usuários.</AdminMessage>;
  }

  const query = parseUsersQuery(await searchParams);
  const res = await adminApi.listUsers(session, query);
  if (!res.ok) {
    const failure = toAdminFailure(res.status, res.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    return <AdminMessage title="Não foi possível carregar os usuários">{failure.message}</AdminMessage>;
  }
  // Página além do fim (ex.: filtro mudou): leva à última página existente.
  if (query.page > res.data.totalPages) redirect(usersHref({ ...query, page: res.data.totalPages }));

  return <UsersPage query={query} result={res.data} />;
}
