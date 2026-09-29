import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { auditHref, parseAuditQuery } from '@/lib/admin/audit-query';
import AuditPage from '@/views/admin/AuditPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Auditoria' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'audit.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar a auditoria.</AdminMessage>;
  }

  const query = parseAuditQuery(await searchParams);
  const [res, summary] = await Promise.all([adminApi.listAudit(session, query), adminApi.auditSummary(session, query)]);
  if (!res.ok) {
    const failure = toAdminFailure(res.status, res.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    return <AdminMessage title="Não foi possível carregar a auditoria">{failure.message}</AdminMessage>;
  }
  // Página além do fim (ex.: filtro mudou): leva à última página existente.
  if (query.page > res.data.totalPages) redirect(auditHref({ ...query, page: res.data.totalPages }));

  // Sem o resumo (falha pontual), a lista funciona sem os cards de período.
  return <AuditPage query={query} result={res.data} summary={summary.ok ? summary.data : null} />;
}
