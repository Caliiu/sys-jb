'use client';

import type {
  AdminPromoterOption,
  AdminTicketDrawOption,
  AdminTicketList,
  AdminTicketListItem,
} from '@sysjb/contracts';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { PlayerOption } from '@/app/admin/actions';
import { Main } from '@/admin/components/layout/main';
import { UrlPagination } from '@/admin/components/url-pagination';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { soldCents, ticketsBaseHref, withPule } from '@/lib/admin/tickets-format';
import { type TicketsQuery, ticketsHref } from '@/lib/admin/tickets-query';
import { type TicketDetailState, TicketDetailSheet } from './components/ticket-detail-sheet';
import { TicketsFilters } from './components/tickets-filters';
import { TicketsSummary } from './components/tickets-summary';
import { TicketsTable } from './components/tickets-table';

/** O que a tela mostra: a lista do dia (paginada) ou os pules de um número (um por jogo, sem paginação). */
export type TicketsResult = { kind: 'list'; page: AdminTicketList } | { kind: 'ticket'; items: AdminTicketListItem[] };

export type TicketsProps = {
  query: TicketsQuery;
  /** Hoje (YYYY-MM-DD, Brasília), do servidor. */
  today: string;
  promoters: AdminPromoterOption[] | null;
  draws: AdminTicketDrawOption[] | null;
  player: PlayerOption | null;
  result: TicketsResult;
  /** Pule aberto pela URL (?pule=...); null = nenhum. */
  detail: TicketDetailState | null;
};

/** Link do PDF: os mesmos filtros da lista (ou o número pesquisado), sem a paginação. */
export function ticketsPdfHref(query: TicketsQuery): string {
  const params = new URL(ticketsBaseHref({ ...query, page: 1 }), 'http://x').searchParams;
  params.delete('pageSize');
  return `${ADMIN_ROUTES.ticketsPdf}?${params}`;
}

/**
 * Detalhe aberto: o da URL, ou o que o operador acabou de abrir/fechar enquanto a navegação não termina (a gaveta
 * responde na hora; voltar no navegador fecha porque a URL muda).
 */
function useOpenTicket(urlKey: string | null) {
  const [override, setOverride] = useState<{ key: string | null } | null>(null);
  const [seenKey, setSeenKey] = useState(urlKey);
  if (seenKey !== urlKey) {
    setSeenKey(urlKey);
    setOverride(null);
  }
  return [override ? override.key : urlKey, (key: string | null) => setOverride({ key })] as const;
}

/** Pules > Pules Registradas: pules vendidos no dia (data da venda), com o detalhe de cada um. */
export function Tickets({ query, today, promoters, draws, player, result, detail }: TicketsProps) {
  const router = useRouter();
  const baseHref = ticketsBaseHref(query);
  const [openKey, setOpenKey] = useOpenTicket(detail?.key ?? null);
  const detailHref = useCallback((key: string) => withPule(baseHref, key), [baseHref]);
  const onOpen = useCallback((key: string) => setOpenKey(key), [setOpenKey]);
  const items = result.kind === 'list' ? result.page.items : result.items;

  return (
    <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pules Registradas</h1>
        <p className="text-muted-foreground">
          Pules vendidas no dia, das mais recentes para as mais antigas. Clique no número para ver as apostas.
        </p>
      </div>
      {/* key: Limpar e voltar/avançar trocam a URL; os campos acompanham. */}
      <TicketsFilters
        key={ticketsHref(query)}
        query={query}
        today={today}
        promoters={promoters}
        draws={draws}
        player={player}
      />
      {result.kind === 'ticket' && (
        <div
          role="note"
          aria-label="Pesquisa por número"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/50 px-4 py-2 text-sm"
        >
          <span>
            Busca pela pule <strong className="tabular-nums">Nº {query.ticket}</strong> — todas as datas
          </span>
          <Link
            href={ADMIN_ROUTES.tickets}
            className="inline-flex items-center gap-1.5 text-primary hover:underline print:hidden"
          >
            <ArrowLeft className="size-4" /> Voltar à lista do dia
          </Link>
        </div>
      )}
      {result.kind === 'list' ? (
        <TicketsSummary kind="list" date={query.date} total={result.page.total} totalCents={result.page.totalCents} />
      ) : (
        <TicketsSummary kind="ticket" ticket={query.ticket!} total={items.length} totalCents={soldCents(items)} />
      )}
      <TicketsTable
        key={result.kind === 'list' ? `${result.page.page}:${baseHref}` : baseHref}
        items={items}
        pdfHref={ticketsPdfHref(query)}
        ticket={query.ticket}
        detailHref={detailHref}
        onOpen={onOpen}
      />
      {result.kind === 'list' && (
        <UrlPagination
          page={result.page.page}
          totalPages={result.page.totalPages}
          pageSize={query.pageSize}
          hrefFor={(page, pageSize = query.pageSize) => ticketsHref({ ...query, page, pageSize })}
        />
      )}
      <TicketDetailSheet
        openKey={openKey}
        detail={detail && detail.key === openKey ? detail : null}
        onClose={() => {
          setOpenKey(null);
          router.push(baseHref, { scroll: false });
        }}
      />
    </Main>
  );
}
