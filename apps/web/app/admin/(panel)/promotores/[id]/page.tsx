import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { pageHref, parsePage } from '@/lib/admin/promoters-query';
import PromoterDetailPage from '@/views/admin/PromoterDetailPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Promotor' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'promoters.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar promotores.</AdminMessage>;
  }

  const { id } = await params;
  const page = parsePage((await searchParams).page);
  const [promoter, referrals] = await Promise.all([
    adminApi.getPromoter(session, id),
    adminApi.listReferrals(session, id, page),
  ]);

  if (!promoter.ok || !referrals.ok) {
    const failed = !promoter.ok ? promoter : referrals;
    if (!failed.ok) {
      // 400 = id que nem é UUID; para o operador é o mesmo que não existir.
      if (failed.status === 404 || failed.status === 400) {
        return (
          <AdminMessage title="Promotor não encontrado" backToPromoters>
            Este usuário não é promotor nesta banca (ou foi removido).
          </AdminMessage>
        );
      }
      const failure = toAdminFailure(failed.status, failed.error);
      if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
      return (
        <AdminMessage title="Não foi possível carregar o promotor" backToPromoters>
          {failure.message}
        </AdminMessage>
      );
    }
  }
  if (!promoter.ok || !referrals.ok) return null; // já tratado acima (só para o TypeScript)

  // Página além do fim: leva à última página existente.
  if (page > referrals.data.totalPages) {
    redirect(pageHref(ADMIN_ROUTES.promoter(id), { page: referrals.data.totalPages }));
  }

  return (
    <PromoterDetailPage
      promoter={promoter.data}
      referrals={referrals.data}
      canManage={can(session.operator, 'promoters.manage')}
    />
  );
}
