import { ADMIN_ROUTES } from './admin-routes';

export const PROMOTERS_PAGE_SIZE = 20;
const SEARCH_MAX = 100;

export interface PromotersQuery {
  page: number;
  search: string;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Página da URL com tolerância: valor inválido vira 1, nunca erro (a URL é digitável). */
export function parsePage(raw: string | string[] | undefined): number {
  const page = Number(first(raw));
  return Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1;
}

export function parsePromotersQuery(raw: Record<string, string | string[] | undefined>): PromotersQuery {
  return { page: parsePage(raw.page), search: (first(raw.search) ?? '').trim().slice(0, SEARCH_MAX) };
}

/** Endereço com página (e busca) na URL; omite o que é padrão. */
export function pageHref(path: string, params: { page?: number; search?: string }): string {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.page && params.page > 1) query.set('page', String(params.page));
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export const promotersHref = (query: Partial<PromotersQuery>) => pageHref(ADMIN_ROUTES.promoters, query);
