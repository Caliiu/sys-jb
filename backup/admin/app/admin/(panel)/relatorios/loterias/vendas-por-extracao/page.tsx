import { drawDateOf } from '@sysjb/contracts';
import { redirect, unauthorized } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { parseSalesByDrawQuery, salesByDrawHref, salesByDrawMaxDate } from '@/lib/admin/sales-by-draw-query';
import SalesByDrawPage from '@/views/admin/SalesByDrawPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vendas por extração' };

/** Relatórios > Loterias > Vendas por extração: filtros sempre; os dados só depois de pesquisar. */
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
  const query = parseSalesByDrawQuery(await searchParams, nowIso);
  const [promoters, player, report] = await Promise.all([
    adminApi.listPromoterOptions(session),
    query.userId ? adminApi.getUser(session, query.userId) : null,
    query.searched ? adminApi.salesByDraw(session, query) : null,
  ]);

  if (report && !report.ok) {
    const failure = toAdminFailure(report.status, report.error);
    if (failure.code === 'SESSION_INVALID') unauthorized();
    // Promotor que deixou de ser promotor (link antigo): volta para todos.
    if (report.status === 404 && query.promoterId) redirect(salesByDrawHref({ ...query, promoterId: '' }));
    return <AdminMessage title="Não foi possível carregar o relatório">{failure.message}</AdminMessage>;
  }

  return (
    <SalesByDrawPage
      query={query}
      today={drawDateOf(nowIso, 0)}
      maxDate={salesByDrawMaxDate(nowIso)}
      // Sem as opções (falha pontual), o filtro de promotor fica só com "Todos".
      promoters={promoters.ok ? promoters.data : null}
      player={player?.ok ? { id: player.data.id, displayId: player.data.displayId, name: player.data.name } : null}
      report={report?.ok ? report.data : null}
    />
  );
}
