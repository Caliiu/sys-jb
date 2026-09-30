import { drawDateOf } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { parseTicketsQuery, ticketsHref } from '@/lib/admin/tickets-query';
import TicketsPage, { type TicketsResult } from '@/views/admin/TicketsPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bilhetes' };

/** Operação > Bilhetes: filtros sempre; a lista (ou a pesquisa por ticket) só depois de pesquisar. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'tickets.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar os bilhetes.</AdminMessage>;
  }

  const nowIso = new Date().toISOString();
  const query = parseTicketsQuery(await searchParams, nowIso);
  const [promoters, draws, player, listed, searched] = await Promise.all([
    adminApi.listPromoterOptions(session),
    adminApi.ticketDrawOptions(session),
    query.userId ? adminApi.getUser(session, query.userId) : null,
    query.searched && query.ticket === null ? adminApi.listTickets(session, query) : null,
    query.ticket !== null ? adminApi.searchTicket(session, query.ticket) : null,
  ]);

  let result: TicketsResult | null = null;
  const main = searched ?? listed;
  if (main && !main.ok) {
    const failure = toAdminFailure(main.status, main.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    return <AdminMessage title="Não foi possível carregar os bilhetes">{failure.message}</AdminMessage>;
  }
  if (searched?.ok) result = { kind: 'ticket', items: searched.data };
  if (listed?.ok) {
    // Página além do fim (ex.: filtro mudou): leva à última página existente.
    if (query.page > listed.data.totalPages) redirect(ticketsHref({ ...query, page: listed.data.totalPages }));
    result = { kind: 'list', page: listed.data };
  }

  return (
    <TicketsPage
      query={query}
      today={drawDateOf(nowIso, 0)}
      // Sem as opções (falha pontual), os filtros funcionam sem elas.
      promoters={promoters.ok ? promoters.data : null}
      draws={draws.ok ? draws.data : null}
      player={player?.ok ? { id: player.data.id, displayId: player.data.displayId, name: player.data.name } : null}
      result={result}
    />
  );
}
