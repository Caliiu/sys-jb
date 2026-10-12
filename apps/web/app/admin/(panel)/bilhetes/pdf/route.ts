import type { AdminTicketListItem } from '@sysjb/contracts';
import { adminApi } from '@/lib/admin/admin-api';
import { can, resolveAdminRequest } from '@/lib/admin/admin-context';
import { buildTablePdf } from '@/lib/admin/table-pdf';
import { soldCents } from '@/lib/admin/tickets-format';
import { parseTicketsQuery } from '@/lib/admin/tickets-query';
import { TICKETS_PDF_MAX_ROWS, ticketsPdfContent } from '@/lib/admin/tickets-report-pdf';
import { formatDateTime } from '@/lib/datetime';

const PAGE_SIZE = 100;

/**
 * PDF das Pules Registradas com os filtros da URL (todas as páginas, até TICKETS_PDF_MAX_ROWS) ou a pesquisa por
 * número. Rotas não passam pelo layout do painel: o host e a sessão do operador são conferidos aqui (e a API confere
 * de novo).
 */
export async function GET(request: Request) {
  const ctx = await resolveAdminRequest();
  if (!ctx.ok) return new Response(null, { status: 404 });
  if (!ctx.me || !ctx.token) return new Response(null, { status: 401 });
  if (!can(ctx.me.operator, 'tickets.read')) return new Response(null, { status: 403 });

  const now = new Date().toISOString();
  const query = parseTicketsQuery(Object.fromEntries(new URL(request.url).searchParams), now);
  const session = { hostname: ctx.hostname, token: ctx.token };
  const failed = (status: number) => new Response(null, { status: status === 401 || status === 403 ? status : 502 });

  let totals = { total: 0, totalCents: 0 };
  const items: AdminTicketListItem[] = [];
  if (query.ticket !== null) {
    const res = await adminApi.searchTicket(session, query.ticket);
    if (!res.ok) return failed(res.status);
    items.push(...res.data);
    totals = { total: res.data.length, totalCents: soldCents(res.data) };
  } else {
    for (let page = 1; items.length < TICKETS_PDF_MAX_ROWS; page += 1) {
      const res = await adminApi.listTickets(session, { ...query, page, pageSize: PAGE_SIZE });
      if (!res.ok) return failed(res.status);
      if (page === 1) totals = { total: res.data.total, totalCents: res.data.totalCents };
      items.push(...res.data.items);
      if (page >= res.data.totalPages) break;
    }
  }

  // Nomes dos filtros escolhidos (sem eles, o PDF diz só "filtrado").
  const [promoters, draws, player] = await Promise.all([
    query.promoterId ? adminApi.listPromoterOptions(session) : null,
    query.drawId ? adminApi.ticketDrawOptions(session) : null,
    query.userId ? adminApi.getUser(session, query.userId) : null,
  ]);
  const promoter = promoters?.ok ? promoters.data.find((p) => p.id === query.promoterId) : undefined;
  const draw = draws?.ok ? draws.data.find((d) => d.id === query.drawId) : undefined;

  const pdf = buildTablePdf(
    ticketsPdfContent({
      tenantName: ctx.me.tenant.name,
      query,
      drawLabel: query.drawId ? (draw ? `${draw.name} ${draw.drawTime}` : 'Loteria filtrada') : null,
      promoterLabel: query.promoterId
        ? promoter
          ? `${promoter.displayId} · ${promoter.name}`
          : 'Promotor filtrado'
        : null,
      playerLabel: query.userId
        ? player?.ok
          ? `${player.data.displayId} | ${player.data.name}`
          : 'Apostador filtrado'
        : null,
      totals,
      items: items.slice(0, TICKETS_PDF_MAX_ROWS),
      generatedAt: formatDateTime(now),
    }),
  );
  const name = query.ticket !== null ? `pule-${query.ticket}` : `pules-registradas-${query.date}`;
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
