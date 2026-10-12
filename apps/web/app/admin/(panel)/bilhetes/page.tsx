import { drawDateOf } from '@sysjb/contracts';
import { redirect, unauthorized } from 'next/navigation';
import { Main } from '@/admin/components/layout/main';
import { Alert, AlertDescription, AlertTitle } from '@/admin/components/ui/alert';
import { ForbiddenError } from '@/admin/features/errors/forbidden';
import { Unavailable } from '@/admin/features/errors/unavailable';
import { Tickets, type TicketsResult } from '@/admin/features/tickets';
import type { TicketDetailState } from '@/admin/features/tickets/components/ticket-detail-sheet';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { parsePuleKey } from '@/lib/admin/tickets-format';
import { parseTicketsQuery, ticketsHref } from '@/lib/admin/tickets-query';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pules Registradas' };

/**
 * Pules > Pules Registradas: filtros na URL; sem data na URL, mostra as vendas de hoje. ?ticket=N pesquisa o número em
 * todas as datas; ?pule=jogo-N abre o detalhe do pule (carregado aqui, junto com a lista).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <Unavailable message={gate.message} />;
  const { session } = gate;
  const forbidden = (
    <Main>
      <ForbiddenError />
    </Main>
  );
  if (!can(session.operator, 'tickets.read')) return forbidden;

  const nowIso = new Date().toISOString();
  const raw = await searchParams;
  const query = parseTicketsQuery(raw, nowIso);
  const pule = parsePuleKey(raw.pule);
  const [promoters, draws, player, listed, searched, opened] = await Promise.all([
    adminApi.listPromoterOptions(session),
    adminApi.ticketDrawOptions(session),
    query.userId ? adminApi.getUser(session, query.userId) : null,
    query.ticket === null ? adminApi.listTickets(session, query) : null,
    query.ticket !== null ? adminApi.searchTicket(session, query.ticket) : null,
    pule ? adminApi.getTicket(session, pule.game, pule.number) : null,
  ]);

  const main = (searched ?? listed)!;
  if (!main.ok) {
    const failure = toAdminFailure(main.status, main.error);
    if (failure.code === 'SESSION_INVALID') unauthorized();
    if (failure.code === 'FORBIDDEN') return forbidden;
    return (
      <Main>
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar as pules</AlertTitle>
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      </Main>
    );
  }

  let result: TicketsResult;
  if (listed?.ok) {
    // Página além do fim (ex.: o filtro mudou): leva à última página existente.
    if (query.page > Math.max(1, listed.data.totalPages)) {
      redirect(ticketsHref({ ...query, page: listed.data.totalPages }));
    }
    result = { kind: 'list', page: listed.data };
  } else {
    result = { kind: 'ticket', items: searched?.ok ? searched.data : [] };
  }

  let detail: TicketDetailState | null = null;
  if (pule && opened) {
    const key = `${pule.game}-${pule.number}`;
    if (opened.ok) detail = { key, status: 'ok', ticket: opened.data };
    else if (opened.status === 404) detail = { key, status: 'not-found' };
    else {
      const failure = toAdminFailure(opened.status, opened.error);
      if (failure.code === 'SESSION_INVALID') unauthorized();
      detail = { key, status: 'error', message: failure.message };
    }
  }

  return (
    <Tickets
      query={query}
      today={drawDateOf(nowIso, 0)}
      // Sem as opções (falha pontual), os filtros ficam só com "todos".
      promoters={promoters.ok ? promoters.data : null}
      draws={draws.ok ? draws.data : null}
      player={player?.ok ? { id: player.data.id, displayId: player.data.displayId, name: player.data.name } : null}
      result={result}
      detail={detail}
    />
  );
}
