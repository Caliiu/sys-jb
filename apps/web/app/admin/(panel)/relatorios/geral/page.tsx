import { drawDateOf } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { generalReportHref, parseGeneralReportQuery } from '@/lib/admin/general-report-query';
import GeneralReportPage from '@/views/admin/GeneralReportPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Relatório geral' };

/** Relatórios > Relatório geral: abre em hoje, ordenado pelas maiores vendas. */
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
  const query = parseGeneralReportQuery(await searchParams, nowIso);
  const [promoters, player, report] = await Promise.all([
    adminApi.listPromoterOptions(session),
    query.userId ? adminApi.getUser(session, query.userId) : null,
    adminApi.generalReport(session, query),
  ]);

  if (!report.ok) {
    const failure = toAdminFailure(report.status, report.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    // Promotor que deixou de ser promotor (link antigo): volta para todos.
    if (report.status === 404 && query.promoterId) redirect(generalReportHref({ ...query, promoterId: '', page: 1 }));
    return <AdminMessage title="Não foi possível carregar o relatório">{failure.message}</AdminMessage>;
  }
  // Página além do fim (ex.: filtro mudou): leva à última página existente.
  if (query.page > report.data.totalPages) redirect(generalReportHref({ ...query, page: report.data.totalPages }));

  return (
    <GeneralReportPage
      query={query}
      today={drawDateOf(nowIso, 0)}
      // Sem as opções (falha pontual), o filtro de promotor fica só com "Todos".
      promoters={promoters.ok ? promoters.data : null}
      player={player?.ok ? { id: player.data.id, displayId: player.data.displayId, name: player.data.name } : null}
      report={report.data}
    />
  );
}
