import type { AdminPrizeList, AdminPrizeListItem } from '@sysjb/contracts';
import { formatBrl } from '../currency';
import { formatCalendarDate } from '../datetime';
import { PRIZE_STATUS_LABELS, orDash, periodText, prizePlayerText, prizeStatusFilterLabel } from './prizes-format';
import type { PrizesQuery } from './prizes-query';
import type { TablePdfColumn, TablePdfInput } from './table-pdf';

/** Máximo de linhas no PDF (páginas de 100 da API); passando disso, o PDF avisa que mostra só as primeiras. */
export const PRIZES_PDF_MAX_ROWS = 5000;

export const PRIZES_PDF_COLUMNS: TablePdfColumn[] = [
  { header: 'Data', width: 50 },
  { header: 'Apostador', width: 140 },
  { header: 'Pule', width: 46, align: 'right' },
  { header: 'Loteria', width: 120 },
  { header: 'Modalidade', width: 74 },
  { header: 'Número', width: 86 },
  { header: 'Colocação', width: 66 },
  { header: 'Valor', width: 60, align: 'right' },
  { header: 'Valor Prêmio', width: 72, align: 'right' },
  { header: 'Status', width: 72 },
];

export interface PrizesPdfData {
  tenantName: string;
  query: Pick<PrizesQuery, 'from' | 'to' | 'status'>;
  /** Nome do promotor do filtro; null = todos. */
  promoterLabel: string | null;
  /** Totais do filtro inteiro (da primeira página da API). */
  totals: Pick<AdminPrizeList, 'total' | 'totalPrizeCents' | 'pendingCount' | 'reviewsTotal'>;
  /** Linhas buscadas (até PRIZES_PDF_MAX_ROWS). */
  items: AdminPrizeListItem[];
  /** "09/10/2026 14:30" */
  generatedAt: string;
}

/** Células de uma aposta premiada, na ordem de PRIZES_PDF_COLUMNS. */
export const prizePdfRow = (item: AdminPrizeListItem): string[] => [
  formatCalendarDate(item.drawDate),
  prizePlayerText(item),
  String(item.puleNumber),
  `${item.lottery} (${item.drawCode})`,
  orDash(item.modalityLabel),
  orDash(item.guess),
  orDash(item.placementLabel),
  formatBrl(item.stakeCents),
  formatBrl(item.prizeCents),
  PRIZE_STATUS_LABELS[item.status],
];

/** Conteúdo do PDF da tela Pules Premiadas: os mesmos filtros, totais e colunas da tela. */
export function prizesPdfContent(data: PrizesPdfData): TablePdfInput {
  const { totals } = data;
  const lines = [
    data.tenantName,
    `Período: ${periodText(data.query.from, data.query.to)}`,
    `Promotor: ${data.promoterLabel ?? 'Todos os promotores'} · Status: ${prizeStatusFilterLabel(data.query.status)}`,
    `Prêmios: ${totals.total} · Total em prêmios: ${formatBrl(totals.totalPrizeCents)}`,
  ];
  if (totals.pendingCount > 0) {
    lines.push(`${totals.pendingCount} pule(s) com sorteio já passado aguardando apuração.`);
  }
  if (totals.reviewsTotal > 0) {
    lines.push(
      `Atenção: ${totals.reviewsTotal} pule(s) com resultado corrigido depois do pagamento (confira na tela do painel).`,
    );
  }
  if (totals.total > data.items.length) {
    lines.push(`Mostrando as primeiras ${data.items.length} de ${totals.total} apostas premiadas (maiores prêmios).`);
  }
  return {
    title: 'Pules Premiadas',
    lines,
    columns: PRIZES_PDF_COLUMNS,
    rows: data.items.map(prizePdfRow),
    emptyText: 'Nenhuma pule premiada no período.',
    footer: `Gerado em ${data.generatedAt}`,
  };
}
