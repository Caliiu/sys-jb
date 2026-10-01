import { drawDateOf } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { operationSummaryHref, parseOperationSummaryQuery } from '@/lib/admin/operation-summary-query';
import OperationSummaryPage from '@/views/admin/OperationSummaryPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Resumo da Operação' };

/** Operação > Resumo da Operação: abre no mês até hoje, de todos os promotores. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'operation.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode ver o resumo da operação.</AdminMessage>;
  }

  const nowIso = new Date().toISOString();
  const query = parseOperationSummaryQuery(await searchParams, nowIso);
  const [promoters, summary] = await Promise.all([
    adminApi.listPromoterOptions(session),
    adminApi.operationSummary(session, query),
  ]);

  if (!summary.ok) {
    const failure = toAdminFailure(summary.status, summary.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    // Promotor que deixou de ser promotor (link antigo): volta para todos.
    if (summary.status === 404 && query.promoterId) redirect(operationSummaryHref({ ...query, promoterId: '' }));
    return <AdminMessage title="Não foi possível carregar o resumo da operação">{failure.message}</AdminMessage>;
  }

  return (
    <OperationSummaryPage
      query={query}
      today={drawDateOf(nowIso, 0)}
      // Sem as opções (falha pontual), o filtro de promotor fica só com "Todos".
      promoters={promoters.ok ? promoters.data : null}
      summary={summary.data}
    />
  );
}
