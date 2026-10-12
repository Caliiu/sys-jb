'use client';

import type { AdminPrizeListItem, AdminPrizeStatusFilter } from '@sysjb/contracts';
import { useMemo, useState } from 'react';
import { ReportTable } from '@/admin/components/report-table';
import { ReportToolbar } from '@/admin/components/report-toolbar';
import { matchesPrizeSearch } from '@/lib/admin/prizes-format';
import { prizesColumns } from './prizes-columns';

type PrizesTableProps = {
  items: AdminPrizeListItem[];
  /** Link do PDF com os filtros atuais (todas as páginas). */
  pdfHref: string;
  /** Situação filtrada (muda o texto de lista vazia). */
  status: AdminPrizeStatusFilter | null;
};

/** Texto de lista vazia conforme a situação filtrada. */
export function emptyPrizesText(status: AdminPrizeStatusFilter | null): string {
  if (status === 'pending') {
    return 'Nenhuma pule premiada aguardando apuração. As pules aguardando apuração que não tiveram prêmio não aparecem aqui.';
  }
  return status === 'paid' ? 'Nenhuma pule premiada paga no período.' : 'Nenhuma pule premiada no período.';
}

/** Barra (pesquisa na página, Imprimir, PDF) e a tabela no estilo do template. */
export function PrizesTable({ items, pdfHref, status }: PrizesTableProps) {
  const [search, setSearch] = useState('');
  const rows = useMemo(() => items.filter((item) => matchesPrizeSearch(item, search)), [items, search]);

  return (
    <div className="flex flex-col gap-4">
      <ReportToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Pesquisar pule, apostador, loteria ou número..."
        pdfHref={pdfHref}
      />
      <ReportTable
        label="Pules premiadas"
        columns={prizesColumns}
        rows={rows}
        rowKey={(item) => item.id}
        emptyText={items.length === 0 ? emptyPrizesText(status) : 'Nenhuma pule desta página bate com a pesquisa.'}
      />
    </div>
  );
}
