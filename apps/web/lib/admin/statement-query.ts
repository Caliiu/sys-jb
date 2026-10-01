import { OPERATION_SUMMARY_MAX_DAYS, drawDateOf } from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';
import { DEFAULT_PAGE_SIZE, parsePageSize } from './page-size';
import { isValidPeriod } from './period';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StatementQuery {
  /** Pesquisou com período válido e um apostador (a tela só mostra o extrato assim). */
  searched: boolean;
  /** Período (YYYY-MM-DD, Brasília), inclusivo; padrão: hoje. */
  from: string;
  to: string;
  /** '' = nenhum escolhido. */
  userId: string;
  page: number;
  pageSize: number;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Filtros da URL com tolerância: valor inválido vira o padrão, nunca erro (a URL é digitável). */
export function parseStatementQuery(
  raw: Record<string, string | string[] | undefined>,
  nowIso: string,
): StatementQuery {
  const today = drawDateOf(nowIso, 0);
  const from = first(raw.de) ?? '';
  const to = first(raw.ate) ?? '';
  const validPeriod = isValidPeriod(nowIso, from, to, OPERATION_SUMMARY_MAX_DAYS);
  const user = first(raw.apostador) ?? '';
  const userId = UUID.test(user) ? user.toLowerCase() : '';
  const page = Number(first(raw.page));
  return {
    searched: validPeriod && userId !== '',
    from: validPeriod ? from : today,
    to: validPeriod ? to : today,
    userId,
    page: Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1,
    pageSize: parsePageSize(raw.pageSize),
  };
}

/** Endereço do extrato com os filtros; omite o que é padrão. */
export function statementHref(query: Omit<StatementQuery, 'searched'>): string {
  const params = new URLSearchParams({ de: query.from, ate: query.to });
  if (query.userId) params.set('apostador', query.userId);
  if (query.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(query.pageSize));
  if (query.page > 1) params.set('page', String(query.page));
  return `${ADMIN_ROUTES.statement}?${params}`;
}
