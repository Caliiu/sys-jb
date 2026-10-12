import type { AdminTicketListItem } from '@sysjb/contracts';
import { formatBrl } from '../currency';
import { formatCalendarDate, formatShortDateTime } from '../datetime';
import { GAME_LABELS, orDash } from './prizes-format';
import type { TablePdfColumn, TablePdfInput } from './table-pdf';
import { TICKET_STATUS_LABELS, ticketPlayerText } from './tickets-format';
import type { TicketsQuery } from './tickets-query';

/** Máximo de linhas no PDF (páginas de 100 da API); passando disso, o PDF avisa que mostra só as primeiras. */
export const TICKETS_PDF_MAX_ROWS = 5000;

export const TICKETS_PDF_COLUMNS: TablePdfColumn[] = [
  { header: 'Pule', width: 72 },
  { header: 'Data/Hora', width: 70 },
  { header: 'Apostador', width: 142 },
  { header: 'Loteria', width: 142 },
  { header: 'Data Valendo', width: 62 },
  { header: 'Cotação', width: 62 },
  { header: 'Valor', width: 60, align: 'right' },
  { header: 'Valor Prêmio', width: 66, align: 'right' },
  { header: 'Status', width: 110 },
];

export interface TicketsPdfData {
  tenantName: string;
  query: Pick<TicketsQuery, 'date' | 'ticket'>;
  /** Nomes dos filtros escolhidos; null = todos. */
  drawLabel: string | null;
  promoterLabel: string | null;
  playerLabel: string | null;
  /** Totais do filtro inteiro (na pesquisa por número, dos pules achados). */
  totals: { total: number; totalCents: number };
  /** Linhas buscadas (até TICKETS_PDF_MAX_ROWS). */
  items: AdminTicketListItem[];
  /** "09/10/2026 14:30" */
  generatedAt: string;
}

/** Células de um pule, na ordem de TICKETS_PDF_COLUMNS (cancelado: o valor vai marcado, não entra no total). */
export const ticketPdfRow = (item: AdminTicketListItem): string[] => [
  item.game === 'fazendinha' ? `${item.puleNumber} (${GAME_LABELS.fazendinha})` : String(item.puleNumber),
  formatShortDateTime(item.createdAt),
  ticketPlayerText(item),
  `${item.lottery} (${item.drawCode})`,
  formatCalendarDate(item.drawDate),
  orDash(item.quoteTable),
  item.canceledAt ? `(${formatBrl(item.totalCents)})` : formatBrl(item.totalCents),
  formatBrl(item.prizeCents),
  TICKET_STATUS_LABELS[item.status],
];

/** Conteúdo do PDF da tela Pules Registradas: os mesmos filtros, totais e colunas da tela. */
export function ticketsPdfContent(data: TicketsPdfData): TablePdfInput {
  const { totals } = data;
  const lines =
    data.query.ticket !== null
      ? [data.tenantName, `Pesquisa da pule Nº ${data.query.ticket} em todas as datas`]
      : [
          data.tenantName,
          `Data da venda: ${formatCalendarDate(data.query.date)} · Loteria: ${data.drawLabel ?? 'Todas as loterias'}`,
          `Promotor: ${data.promoterLabel ?? 'Todos os promotores'} · Apostador: ${data.playerLabel ?? 'Todos'}`,
        ];
  lines.push(`Pules: ${totals.total} · Total vendido: ${formatBrl(totals.totalCents)} (sem as canceladas)`);
  if (totals.total > data.items.length) {
    lines.push(`Mostrando as primeiras ${data.items.length} de ${totals.total} pules (mais recentes).`);
  }
  return {
    title: 'Pules Registradas',
    lines,
    columns: TICKETS_PDF_COLUMNS,
    rows: data.items.map(ticketPdfRow),
    emptyText: data.query.ticket !== null ? 'Nenhuma pule com esse número.' : 'Nenhuma pule vendida no dia.',
    footer: `Gerado em ${data.generatedAt}`,
  };
}
