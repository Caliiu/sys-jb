import type { AdminPrizeList, AdminPrizeListItem } from '@sysjb/contracts';
import { adminApi } from '@/lib/admin/admin-api';
import { can, resolveAdminRequest } from '@/lib/admin/admin-context';
import { parsePrizesQuery } from '@/lib/admin/prizes-query';
import { PRIZES_PDF_MAX_ROWS, prizesPdfContent } from '@/lib/admin/prizes-report-pdf';
import { buildTablePdf } from '@/lib/admin/table-pdf';
import { formatDateTime } from '@/lib/datetime';

const PAGE_SIZE = 100;

/**
 * PDF das Pules Premiadas com os filtros da URL (todas as páginas, até PRIZES_PDF_MAX_ROWS). Rotas não passam pelo
 * layout do painel: o host e a sessão do operador são conferidos aqui (e a API confere de novo).
 */
export async function GET(request: Request) {
  const ctx = await resolveAdminRequest();
  if (!ctx.ok) return new Response(null, { status: 404 });
  if (!ctx.me || !ctx.token) return new Response(null, { status: 401 });
  if (!can(ctx.me.operator, 'tickets.read')) return new Response(null, { status: 403 });

  const now = new Date().toISOString();
  const query = parsePrizesQuery(Object.fromEntries(new URL(request.url).searchParams), now);
  const session = { hostname: ctx.hostname, token: ctx.token };

  const promoters = query.promoterId ? await adminApi.listPromoterOptions(session) : null;
  let totals: AdminPrizeList | null = null;
  const items: AdminPrizeListItem[] = [];
  for (let page = 1; items.length < PRIZES_PDF_MAX_ROWS; page += 1) {
    const res = await adminApi.listPrizes(session, { ...query, page, pageSize: PAGE_SIZE });
    if (!res.ok) return new Response(null, { status: res.status === 401 || res.status === 403 ? res.status : 502 });
    totals ??= res.data;
    items.push(...res.data.items);
    if (page >= res.data.totalPages) break;
  }

  const promoter = promoters?.ok ? promoters.data.find((p) => p.id === query.promoterId) : undefined;
  const pdf = buildTablePdf(
    prizesPdfContent({
      tenantName: ctx.me.tenant.name,
      query,
      promoterLabel: query.promoterId
        ? promoter
          ? `${promoter.displayId} · ${promoter.name}`
          : 'Promotor filtrado'
        : null,
      totals: totals!,
      items: items.slice(0, PRIZES_PDF_MAX_ROWS),
      generatedAt: formatDateTime(now),
    }),
  );
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="pules-premiadas-${query.from}-a-${query.to}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
