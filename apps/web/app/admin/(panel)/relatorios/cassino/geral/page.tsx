import { drawDateOf } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { casinoGeneralHref, parseCasinoGeneralQuery } from '@/lib/admin/casino-general-query';
import CasinoGeneralPage from '@/views/admin/CasinoGeneralPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Geral cassino' };

/** Relatórios > Cassino > Geral cassino: filtros sempre; os dados só depois de pesquisar. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'operation.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode ver os relatórios.</AdminMessage>;
  }

  const nowIso = new Date().toISOString();
  const query = parseCasinoGeneralQuery(await searchParams, nowIso);
  const [promoters, player, report] = await Promise.all([
    adminApi.listPromoterOptions(session),
    query.userId ? adminApi.getUser(session, query.userId) : null,
    query.searched ? adminApi.casinoGeneral(session, query) : null,
  ]);

  if (report && !report.ok) {
    const failure = toAdminFailure(report.status, report.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    // Promotor que deixou de ser promotor (link antigo): volta para todos.
    if (report.status === 404 && query.promoterId) redirect(casinoGeneralHref({ ...query, promoterId: '' }));
    return <AdminMessage title="Não foi possível carregar o relatório">{failure.message}</AdminMessage>;
  }

  return (
    <CasinoGeneralPage
      query={query}
      today={drawDateOf(nowIso, 0)}
      // Sem as opções (falha pontual), o filtro de promotor fica só com "Todos".
      promoters={promoters.ok ? promoters.data : null}
      player={player?.ok ? { id: player.data.id, displayId: player.data.displayId, name: player.data.name } : null}
      report={report?.ok ? report.data : null}
    />
  );
}
