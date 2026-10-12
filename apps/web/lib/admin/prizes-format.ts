import type { AdminPrizeListItem, AdminPrizeStatus, AdminPrizeStatusFilter, AdminTicketGame } from '@sysjb/contracts';
import { formatCalendarDate } from '../datetime';

/** Textos comuns da tela Pules Premiadas e do PDF dela. */

export const PRIZE_STATUS_LABELS: Record<AdminPrizeStatus, string> = {
  PAID: 'Pago',
  PENDING: 'Aguardando apuração',
};

/** Filtro de situação: null = todas. */
export const prizeStatusFilterLabel = (status: AdminPrizeStatusFilter | null) =>
  status === 'paid' ? 'Pagos' : status === 'pending' ? 'Aguardando apuração' : 'Todos';

export const GAME_LABELS: Record<AdminTicketGame, string> = { lotteries: 'Loterias', fazendinha: 'Fazendinha' };

/** Campo que pule antigo não tem (gravado sem os itens). */
export const orDash = (value: string | null | undefined) => (value ? value : '—');

/** "01/10/2026" ou "01/10/2026 a 09/10/2026". */
export const periodText = (from: string, to: string) =>
  from === to ? formatCalendarDate(from) : `${formatCalendarDate(from)} a ${formatCalendarDate(to)}`;

/** "1234 · Maria Souza" */
export const prizePlayerText = (item: Pick<AdminPrizeListItem, 'player'>) =>
  `${item.player.displayId} · ${item.player.name}`;

/** Sem acento e em minúsculas, para comparar. */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Pesquisa da página: pule, apostador (número ou nome), loteria (nome ou código da extração) e número apostado; sem
 * diferenciar acentos nem maiúsculas.
 */
export function matchesPrizeSearch(item: AdminPrizeListItem, search: string): boolean {
  const term = fold(search.trim());
  if (!term) return true;
  const haystack = [
    String(item.puleNumber),
    String(item.player.displayId),
    item.player.name,
    item.lottery,
    item.drawCode,
    item.guess ?? '',
  ];
  return haystack.some((value) => fold(value).includes(term));
}
