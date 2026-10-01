import { drawDateOf } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { parsePrizesQuery, prizesHref } from '@/lib/admin/prizes-query';
import PrizesPage from '@/views/admin/PrizesPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pules Premiadas' };

/** Operação > Pules Premiadas: filtros sempre; a lista só depois de pesquisar. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'tickets.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar as pules premiadas.</AdminMessage>;
  }

  const nowIso = new Date().toISOString();
  const query = parsePrizesQuery(await searchParams, nowIso);
  const [promoters, draws, player, listed] = await Promise.all([
    adminApi.listPromoterOptions(session),
    adminApi.ticketDrawOptions(session),
    query.userId ? adminApi.getUser(session, query.userId) : null,
    query.searched ? adminApi.listPrizes(session, query) : null,
  ]);

  if (listed && !listed.ok) {
    const failure = toAdminFailure(listed.status, listed.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    return <AdminMessage title="Não foi possível carregar as pules premiadas">{failure.message}</AdminMessage>;
  }
  // Página além do fim (ex.: filtro mudou): leva à última página existente.
  if (listed?.ok && query.page > listed.data.totalPages) {
    redirect(prizesHref({ ...query, page: listed.data.totalPages }));
  }

  return (
    <PrizesPage
      query={query}
      today={drawDateOf(nowIso, 0)}
      // Sem as opções (falha pontual), os filtros funcionam sem elas.
      promoters={promoters.ok ? promoters.data : null}
      draws={draws.ok ? draws.data : null}
      player={player?.ok ? { id: player.data.id, displayId: player.data.displayId, name: player.data.name } : null}
      result={listed?.ok ? listed.data : null}
    />
  );
}
