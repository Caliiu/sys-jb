import { USER_STATUSES, type UserStatus } from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';
import { DEFAULT_PAGE_SIZE, parsePageSize } from './page-size';

const SEARCH_MAX = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UsersQuery {
  page: number;
  pageSize: number;
  search: string;
  status: UserStatus | '';
  /** Só os indicados deste promotor; '' = todos. */
  promoterId: string;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Lê a query da URL com tolerância: valor inválido vira o padrão, nunca erro (a URL é digitável). */
export function parseUsersQuery(raw: Record<string, string | string[] | undefined>): UsersQuery {
  const page = Number(first(raw.page));
  const status = first(raw.status);
  const promoterId = first(raw.promoterId) ?? '';
  return {
    page: Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1,
    pageSize: parsePageSize(raw.pageSize),
    search: (first(raw.search) ?? '').trim().slice(0, SEARCH_MAX),
    status: USER_STATUSES.find((s) => s === status) ?? '',
    promoterId: UUID.test(promoterId) ? promoterId.toLowerCase() : '',
  };
}

/** Filtros da lista na URL, sem a página; omite o que é padrão. */
export function usersFilterParams(query: Partial<UsersQuery>): URLSearchParams {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (query.promoterId) params.set('promoterId', query.promoterId);
  if (query.pageSize && query.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(query.pageSize));
  return params;
}

/** Endereço da lista com os filtros; omite o que é padrão (página 1, busca e filtros vazios, 25 por página). */
export function usersHref(query: Partial<UsersQuery>): string {
  const params = usersFilterParams(query);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const qs = params.toString();
  return qs ? `${ADMIN_ROUTES.users}?${qs}` : ADMIN_ROUTES.users;
}

/** CSV da lista com os mesmos filtros (todas as páginas). */
export function usersExportHref(query: Partial<UsersQuery>): string {
  const params = usersFilterParams(query);
  params.delete('pageSize');
  const qs = params.toString();
  return qs ? `${ADMIN_ROUTES.usersExport}?${qs}` : ADMIN_ROUTES.usersExport;
}
