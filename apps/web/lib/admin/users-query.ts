import { USER_STATUSES, type UserStatus } from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';

export const USERS_PAGE_SIZE = 20;
const SEARCH_MAX = 100;

export interface UsersQuery {
  page: number;
  search: string;
  status: UserStatus | '';
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Lê a query da URL com tolerância: valor inválido vira o padrão, nunca erro (a URL é digitável). */
export function parseUsersQuery(raw: Record<string, string | string[] | undefined>): UsersQuery {
  const page = Number(first(raw.page));
  const status = first(raw.status);
  return {
    page: Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1,
    search: (first(raw.search) ?? '').trim().slice(0, SEARCH_MAX),
    status: USER_STATUSES.find((s) => s === status) ?? '',
  };
}

/** Endereço da lista com os filtros; omite o que é padrão (página 1, busca e status vazios). */
export function usersHref(query: Partial<UsersQuery>): string {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const qs = params.toString();
  return qs ? `${ADMIN_ROUTES.users}?${qs}` : ADMIN_ROUTES.users;
}
