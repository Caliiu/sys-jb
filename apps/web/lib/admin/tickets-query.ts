import { dayOffsetOf, drawDateOf } from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';
import { DEFAULT_PAGE_SIZE, parsePageSize } from './page-size';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TICKET = 2_147_483_647;

export interface TicketsQuery {
  /** Houve pesquisa (a tela só mostra resultados depois de Pesquisar). */
  searched: boolean;
  /** Dia da venda (YYYY-MM-DD, Brasília); padrão: hoje. */
  date: string;
  page: number;
  pageSize: number;
  /** '' = todos. */
  promoterId: string;
  userId: string;
  drawId: string;
  /** Pesquisa por ticket (número do bilhete); null = pesquisa pelos filtros. */
  ticket: number | null;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const uuidOf = (value: string | string[] | undefined) => {
  const id = first(value) ?? '';
  return UUID.test(id) ? id.toLowerCase() : '';
};

/** Filtros da URL com tolerância: valor inválido vira o padrão, nunca erro (a URL é digitável). */
export function parseTicketsQuery(raw: Record<string, string | string[] | undefined>, nowIso: string): TicketsQuery {
  const date = first(raw.data) ?? '';
  const offset = dayOffsetOf(nowIso, date);
  const validDate = offset !== null && offset <= 0 && date >= '2000-01-01';
  const page = Number(first(raw.page));
  const ticketText = (first(raw.ticket) ?? '').trim();
  const ticket =
    /^\d{1,10}$/.test(ticketText) && Number(ticketText) >= 1 && Number(ticketText) <= MAX_TICKET
      ? Number(ticketText)
      : null;
  return {
    searched: validDate || ticket !== null,
    date: validDate ? date : drawDateOf(nowIso, 0),
    page: Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1,
    pageSize: parsePageSize(raw.pageSize),
    promoterId: uuidOf(raw.promotor),
    userId: uuidOf(raw.apostador),
    drawId: uuidOf(raw.extracao),
    ticket,
  };
}

/** Endereço da lista com os filtros (a data sempre vai: é ela que marca "pesquisado"); omite o resto que é padrão. */
export function ticketsHref(query: Partial<TicketsQuery> & { date: string }): string {
  const params = new URLSearchParams({ data: query.date });
  if (query.promoterId) params.set('promotor', query.promoterId);
  if (query.userId) params.set('apostador', query.userId);
  if (query.drawId) params.set('extracao', query.drawId);
  if (query.pageSize && query.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(query.pageSize));
  if (query.page && query.page > 1) params.set('page', String(query.page));
  return `${ADMIN_ROUTES.tickets}?${params}`;
}
