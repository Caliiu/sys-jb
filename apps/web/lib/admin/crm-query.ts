import {
  CRM_INACTIVE_SORTS,
  CRM_LIMITS,
  CRM_NEVER_DEPOSITED_SORTS,
  type CrmInactiveSort,
  type CrmList,
  type CrmNeverDepositedSort,
} from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';
import { DEFAULT_PAGE_SIZE, parsePageSize } from './page-size';

/** Ordenação de cada lista (mesmas colunas da API). */
export type CrmSort<L extends CrmList> = L extends 'inactive' ? CrmInactiveSort : CrmNeverDepositedSort;

interface CrmListConfig<L extends CrmList> {
  href: string;
  exportHref: string;
  /** Faixa padrão (a da referência: de 1 a 7 dias sem depositar). */
  defaultMin: number;
  defaultMax: number;
  /** Mínimo dos atalhos (7/15/30/60 dias = de `shortcutMin` a N). */
  shortcutMin: number;
  sorts: readonly CrmSort<L>[];
  defaultSort: CrmSort<L>;
}

export const CRM_LIST_CONFIG: { [L in CrmList]: CrmListConfig<L> } = {
  inactive: {
    href: ADMIN_ROUTES.inactivePlayers,
    exportHref: `${ADMIN_ROUTES.inactivePlayers}/exportar`,
    defaultMin: 1,
    defaultMax: 7,
    shortcutMin: 1,
    sorts: CRM_INACTIVE_SORTS,
    defaultSort: 'daysWithoutDeposit',
  },
  'never-deposited': {
    href: ADMIN_ROUTES.neverDeposited,
    exportHref: `${ADMIN_ROUTES.neverDeposited}/exportar`,
    defaultMin: 0,
    defaultMax: 7,
    shortcutMin: 0,
    sorts: CRM_NEVER_DEPOSITED_SORTS,
    defaultSort: 'relationshipDays',
  },
};

/** Ordenação na URL (em português) -> a da API. */
const SORT_PARAMS: Readonly<Record<string, CrmInactiveSort>> = {
  nome: 'name',
  tipo: 'type',
  promotor: 'promoter',
  codigo: 'code',
  telefone: 'phone',
  depositado: 'totalDeposited',
  'dias-sem-depositar': 'daysWithoutDeposit',
  relacionamento: 'relationshipDays',
  depositos: 'deposits',
};
const SORT_PARAM_OF = Object.fromEntries(Object.entries(SORT_PARAMS).map(([param, sort]) => [sort, param])) as Record<
  CrmInactiveSort,
  string
>;

export const DEFAULT_DIR = 'desc';

export interface CrmQuery<L extends CrmList = CrmList> {
  list: L;
  /** Faixa de dias (inclusiva). */
  minDays: number;
  maxDays: number;
  /** '' = todos. */
  promoterId: string;
  sort: CrmSort<L>;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const dayOf = (value: string | string[] | undefined): number | null => {
  const text = first(value) ?? '';
  if (!/^\d{1,4}$/.test(text)) return null;
  const days = Number(text);
  return days <= CRM_LIMITS.maxDays ? days : null;
};

/** Filtros da URL com tolerância: valor inválido vira o padrão, nunca erro (a URL é digitável). */
export function parseCrmQuery<L extends CrmList>(
  list: L,
  raw: Record<string, string | string[] | undefined>,
): CrmQuery<L> {
  const config = CRM_LIST_CONFIG[list] as CrmListConfig<L>;
  const min = dayOf(raw.min);
  const max = dayOf(raw.max);
  // Faixa só vale inteira e em ordem; senão, a padrão.
  const range =
    min !== null && max !== null && min <= max
      ? { minDays: min, maxDays: max }
      : { minDays: config.defaultMin, maxDays: config.defaultMax };
  const sortParam = first(raw.ordem) ?? '';
  const sort = Object.hasOwn(SORT_PARAMS, sortParam) ? (SORT_PARAMS[sortParam] as CrmSort<L>) : undefined;
  const dir = first(raw.dir);
  const page = Number(first(raw.page));
  const promoter = first(raw.promotor) ?? '';
  return {
    list,
    ...range,
    promoterId: UUID.test(promoter) ? promoter.toLowerCase() : '',
    sort: sort && config.sorts.includes(sort) ? sort : config.defaultSort,
    dir: dir === 'asc' || dir === 'desc' ? dir : DEFAULT_DIR,
    page: Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1,
    pageSize: parsePageSize(raw.pageSize),
  };
}

/** Parâmetros da URL dos filtros (a faixa sempre vai); omite o resto que é padrão. */
export function crmParams(query: CrmQuery): URLSearchParams {
  const config = CRM_LIST_CONFIG[query.list];
  const params = new URLSearchParams({ min: String(query.minDays), max: String(query.maxDays) });
  if (query.promoterId) params.set('promotor', query.promoterId);
  if (query.sort !== config.defaultSort || query.dir !== DEFAULT_DIR) {
    params.set('ordem', SORT_PARAM_OF[query.sort]);
    params.set('dir', query.dir);
  }
  if (query.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(query.pageSize));
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

export const crmHref = (query: CrmQuery) => `${CRM_LIST_CONFIG[query.list].href}?${crmParams(query)}`;

/** "Exportar Excel" com os filtros e a ordem da tela (todas as páginas). */
export function crmExportHref(query: CrmQuery): string {
  const params = crmParams({ ...query, page: 1, pageSize: DEFAULT_PAGE_SIZE });
  return `${CRM_LIST_CONFIG[query.list].exportHref}?${params}`;
}

/** Parâmetro da URL de uma ordenação (o formulário mantém a ordem numa nova pesquisa). */
export const crmSortParam = (sort: CrmInactiveSort) => SORT_PARAM_OF[sort];

/**
 * Ao clicar no cabeçalho: a mesma coluna inverte a direção; outra começa decrescente (maiores primeiro), menos texto
 * (nome, tipo, promotor, telefone), que começa em ordem alfabética. Volta para a primeira página.
 */
export function crmSortHref<L extends CrmList>(query: CrmQuery<L>, sort: CrmSort<L>): string {
  const textual = sort === 'name' || sort === 'type' || sort === 'promoter' || sort === 'phone';
  const dir = query.sort === sort ? (query.dir === 'desc' ? 'asc' : 'desc') : textual ? 'asc' : 'desc';
  return crmHref({ ...query, sort, dir, page: 1 } as CrmQuery);
}

/** Atalho "N dias": a faixa da lista até N (mantém promotor e ordem). */
export function crmShortcutHref(query: CrmQuery, days: number): string {
  return crmHref({ ...query, minDays: CRM_LIST_CONFIG[query.list].shortcutMin, maxDays: days, page: 1 });
}

export const isCrmShortcut = (query: CrmQuery, days: number) =>
  query.minDays === CRM_LIST_CONFIG[query.list].shortcutMin && query.maxDays === days;

/** Filtros no formato da API. */
export function crmApiQuery(query: CrmQuery) {
  return {
    minDays: query.minDays,
    maxDays: query.maxDays,
    sort: query.sort,
    dir: query.dir,
    page: query.page,
    pageSize: query.pageSize,
    ...(query.promoterId ? { promoterId: query.promoterId } : {}),
  };
}
