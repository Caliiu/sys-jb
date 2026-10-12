import type { AdminTicketGame, AdminTicketListItem, AdminTicketStatus } from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';
import { type TicketsQuery, ticketsHref } from './tickets-query';

/** Textos e endereços comuns da tela Pules Registradas e do PDF dela. */

export const TICKET_STATUS_LABELS: Record<AdminTicketStatus, string> = {
  WON: 'Premiada',
  LOST: 'Não premiada',
  PENDING: 'Aguardando apuração',
  CANCELED: 'Cancelada',
};

/** Maior número de pule aceito na pesquisa por número (o da API). */
const MAX_TICKET = 2_147_483_647;

/** "1234 | MARIA SOUZA" */
export const ticketPlayerText = (item: Pick<AdminTicketListItem, 'player'>) =>
  `${item.player.displayId} | ${item.player.name.toUpperCase()}`;

/** "lotteries-123": identifica o pule na URL (cada jogo tem a sua numeração). */
export const puleKey = (item: Pick<AdminTicketListItem, 'game' | 'puleNumber'>) => `${item.game}-${item.puleNumber}`;

/** Lê o pule da URL (?pule=lotteries-123); inválido = nenhum. */
export function parsePuleKey(raw: string | string[] | undefined): { game: AdminTicketGame; number: number } | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = /^(lotteries|fazendinha)-(\d{1,10})$/.exec(value ?? '');
  if (!match) return null;
  const number = Number(match[2]);
  return number >= 1 && number <= MAX_TICKET ? { game: match[1] as AdminTicketGame, number } : null;
}

/** Número digitado que pode ser uma pule (para buscar em todas as datas); null se não for. */
export function ticketNumberOf(text: string): number | null {
  const value = text.trim().replace(/^#/, '');
  if (!/^\d{1,10}$/.test(value)) return null;
  const number = Number(value);
  return number >= 1 && number <= MAX_TICKET ? number : null;
}

/** Pesquisa de uma pule pelo número, em todas as datas. */
export const ticketSearchHref = (number: number) =>
  `${ADMIN_ROUTES.tickets}?${new URLSearchParams({ ticket: String(number) })}`;

/** Endereço da tela aberta (lista do dia ou pesquisa por número), sem o detalhe. */
export const ticketsBaseHref = (query: TicketsQuery) =>
  query.ticket !== null ? ticketSearchHref(query.ticket) : ticketsHref(query);

/** Endereço da tela com o detalhe de um pule aberto. */
export const withPule = (href: string, key: string) => `${href}${href.includes('?') ? '&' : '?'}pule=${key}`;

/** Sem acento e em minúsculas, para comparar. */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Pesquisa da página: pule, apostador (número ou nome) e loteria (nome ou código); sem diferenciar acentos. */
export function matchesTicketSearch(item: AdminTicketListItem, search: string): boolean {
  const term = fold(search.trim().replace(/^#/, ''));
  if (!term) return true;
  const haystack = [
    String(item.puleNumber),
    String(item.player.displayId),
    item.player.name,
    item.lottery,
    item.drawCode,
  ];
  return haystack.some((value) => fold(value).includes(term));
}

/** Total vendido dos pules (cancelados não contam), como o `totalCents` da lista. */
export const soldCents = (items: readonly AdminTicketListItem[]) =>
  items.reduce((sum, item) => sum + (item.canceledAt ? 0 : item.totalCents), 0);
