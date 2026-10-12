'use client';

import type { AdminTicketListItem } from '@sysjb/contracts';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ReportTable } from '@/admin/components/report-table';
import { ReportToolbar } from '@/admin/components/report-toolbar';
import { matchesTicketSearch, ticketNumberOf, ticketSearchHref } from '@/lib/admin/tickets-format';
import { ticketsColumns } from './tickets-columns';

type TicketsTableProps = {
  items: AdminTicketListItem[];
  /** Link do PDF com os filtros atuais (todas as páginas). */
  pdfHref: string;
  /** Número pesquisado em todas as datas; null = lista do dia. */
  ticket: number | null;
  detailHref: (key: string) => string;
  onOpen: (key: string) => void;
};

/** Barra (pesquisa na página, Imprimir, PDF) e a tabela dos pules. */
export function TicketsTable({ items, pdfHref, ticket, detailHref, onOpen }: TicketsTableProps) {
  const [search, setSearch] = useState('');
  const rows = useMemo(() => items.filter((item) => matchesTicketSearch(item, search)), [items, search]);
  const columns = useMemo(() => ticketsColumns(detailHref, onOpen), [detailHref, onOpen]);
  // Número de pule que não está nesta página: oferece buscar em todas as datas.
  const number = ticketNumberOf(search);
  const searchAll = number !== null && number !== ticket && !items.some((item) => item.puleNumber === number);

  return (
    <div className="flex flex-col gap-4">
      <ReportToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Pesquisar pule, apostador ou loteria..."
        pdfHref={pdfHref}
      >
        {searchAll && (
          <Link
            href={ticketSearchHref(number)}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Search className="size-4" /> Buscar a pule Nº {number} em todas as datas
          </Link>
        )}
      </ReportToolbar>
      <ReportTable
        label="Pules registradas"
        columns={columns}
        rows={rows}
        rowKey={(item) => `${item.game}:${item.puleNumber}`}
        emptyText={
          items.length > 0
            ? 'Nenhuma pule desta página bate com a pesquisa.'
            : ticket !== null
              ? 'Nenhuma pule com esse número.'
              : 'Nenhuma pule vendida neste dia com esses filtros.'
        }
      />
    </div>
  );
}
