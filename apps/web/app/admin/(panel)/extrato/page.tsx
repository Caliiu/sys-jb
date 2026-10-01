import { drawDateOf } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { parseStatementQuery, statementHref } from '@/lib/admin/statement-query';
import StatementPage from '@/views/admin/StatementPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Extrato apostador' };

/** Carteira > Extrato apostador: filtros sempre; o extrato só depois de pesquisar com um apostador. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'users.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar o extrato dos apostadores.</AdminMessage>;
  }

  const nowIso = new Date().toISOString();
  const query = parseStatementQuery(await searchParams, nowIso);
  const [player, statement] = await Promise.all([
    query.userId ? adminApi.getUser(session, query.userId) : null,
    query.searched ? adminApi.playerStatement(session, query) : null,
  ]);

  if (statement && !statement.ok) {
    const failure = toAdminFailure(statement.status, statement.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    // Apostador que não existe (ou de outra banca): volta para a escolha.
    if (statement.status === 404) redirect(statementHref({ ...query, userId: '', page: 1 }));
    return <AdminMessage title="Não foi possível carregar o extrato">{failure.message}</AdminMessage>;
  }
  // Página além do fim: leva à última página existente.
  if (statement?.ok && query.page > statement.data.totalPages) {
    redirect(statementHref({ ...query, page: statement.data.totalPages }));
  }

  return (
    <StatementPage
      query={query}
      today={drawDateOf(nowIso, 0)}
      player={player?.ok ? { id: player.data.id, displayId: player.data.displayId, name: player.data.name } : null}
      statement={statement?.ok ? statement.data : null}
    />
  );
}
