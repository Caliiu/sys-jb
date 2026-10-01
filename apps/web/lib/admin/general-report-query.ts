import {
  type GeneralReportSort,
  type GeneralReportType,
  OPERATION_SUMMARY_MAX_DAYS,
  drawDateOf,
} from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';
import { DEFAULT_PAGE_SIZE, parsePageSize } from './page-size';
import { isValidPeriod } from './period';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ordenação na URL (em português) -> a da API. */
export const SORT_PARAMS: Readonly<Record<string, GeneralReportSort>> = {
  nome: 'name',
  tipo: 'type',
  vendas: 'sales',
  comissao: 'commission',
  'comissao-amigo': 'referralCommission',
  premios: 'prizes',
  outros: 'other',
  liquido: 'net',
};
const SORT_PARAM_OF = Object.fromEntries(Object.entries(SORT_PARAMS).map(([param, sort]) => [sort, param])) as Record<
  GeneralReportSort,
  string
>;

/** Parâmetro da URL de uma ordenação (ex.: referralCommission -> comissao-amigo). */
export const sortParamOf = (sort: GeneralReportSort) => SORT_PARAM_OF[sort];

const TYPE_PARAMS: Readonly<Record<string, GeneralReportType>> = { apostador: 'player', promotor: 'promoter' };
const TYPE_PARAM_OF: Record<GeneralReportType, string> = { player: 'apostador', promoter: 'promotor' };

export const DEFAULT_SORT: GeneralReportSort = 'sales';
export const DEFAULT_DIR = 'desc';

export interface GeneralReportQuery {
  /** Período (YYYY-MM-DD, Brasília), inclusivo; padrão: hoje. */
  from: string;
  to: string;
  page: number;
  pageSize: number;
  /** '' = todos. */
  promoterId: string;
  userId: string;
  type: GeneralReportType | '';
  sort: GeneralReportSort;
  dir: 'asc' | 'desc';
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const uuidOf = (value: string | string[] | undefined) => {
  const id = first(value) ?? '';
  return UUID.test(id) ? id.toLowerCase() : '';
};
const own = <T>(map: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(map, key) ? map[key] : undefined;

/** Filtros da URL com tolerância: valor inválido vira o padrão, nunca erro (a URL é digitável). */
export function parseGeneralReportQuery(
  raw: Record<string, string | string[] | undefined>,
  nowIso: string,
): GeneralReportQuery {
  const today = drawDateOf(nowIso, 0);
  const from = first(raw.de) ?? '';
  const to = first(raw.ate) ?? '';
  const period = isValidPeriod(nowIso, from, to, OPERATION_SUMMARY_MAX_DAYS)
    ? { from, to }
    : { from: today, to: today };
  const page = Number(first(raw.page));
  const dir = first(raw.dir);
  return {
    ...period,
    page: Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1,
    pageSize: parsePageSize(raw.pageSize),
    promoterId: uuidOf(raw.promotor),
    userId: uuidOf(raw.apostador),
    type: own(TYPE_PARAMS, first(raw.tipo) ?? '') ?? '',
    sort: own(SORT_PARAMS, first(raw.ordem) ?? '') ?? DEFAULT_SORT,
    dir: dir === 'asc' || dir === 'desc' ? dir : DEFAULT_DIR,
  };
}

/** Endereço do relatório com os filtros (o período sempre vai); omite o resto que é padrão. */
export function generalReportHref(query: GeneralReportQuery): string {
  const params = new URLSearchParams({ de: query.from, ate: query.to });
  if (query.promoterId) params.set('promotor', query.promoterId);
  if (query.userId) params.set('apostador', query.userId);
  if (query.type) params.set('tipo', TYPE_PARAM_OF[query.type]);
  if (query.sort !== DEFAULT_SORT || query.dir !== DEFAULT_DIR) {
    params.set('ordem', SORT_PARAM_OF[query.sort]);
    params.set('dir', query.dir);
  }
  if (query.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(query.pageSize));
  if (query.page > 1) params.set('page', String(query.page));
  return `${ADMIN_ROUTES.generalReport}?${params}`;
}

/**
 * Endereço ao clicar no cabeçalho de uma coluna: a mesma coluna inverte a direção; outra começa decrescente (maiores
 * primeiro), menos o nome, que começa em ordem alfabética. Volta para a primeira página.
 */
export function sortHref(query: GeneralReportQuery, sort: GeneralReportSort): string {
  const dir = query.sort === sort ? (query.dir === 'desc' ? 'asc' : 'desc') : sort === 'name' ? 'asc' : 'desc';
  return generalReportHref({ ...query, sort, dir, page: 1 });
}
