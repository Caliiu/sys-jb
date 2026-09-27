import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { parsePromotersQuery, promotersHref } from '@/lib/admin/promoters-query';
import PromotersPage from '@/views/admin/PromotersPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Promotores' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'promoters.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar promotores.</AdminMessage>;
  }

  const query = parsePromotersQuery(await searchParams);
  const res = await adminApi.listPromoters(session, query);
  if (!res.ok) {
    const failure = toAdminFailure(res.status, res.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    return <AdminMessage title="Não foi possível carregar os promotores">{failure.message}</AdminMessage>;
  }
  // Página além do fim (ex.: busca mudou): leva à última página existente.
  if (query.page > res.data.totalPages) redirect(promotersHref({ ...query, page: res.data.totalPages }));

  return <PromotersPage query={query} result={res.data} canManage={can(session.operator, 'promoters.manage')} />;
}
