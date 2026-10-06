import { type DepositStatus, OPERATION_SUMMARY_MAX_DAYS, drawDateOf } from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';
import { parsePageSize } from './page-size';
import { isValidPeriod } from './period';

/**
 * Carteira > Depósitos e Carteira > Saques: as mesmas telas de filtro, cada uma com os seus status. Depósitos vêm da
 * API (integração de pagamento); os saques ainda não são registrados no sistema, então os status deles ficam só aqui,
 * na tela, até virarem contrato da API.
 */
export type WalletMovementKind = 'deposits' | 'withdrawals';

interface StatusOption {
  /** Valor na URL (em português). */
  param: string;
  label: string;
}

/** Situação do depósito na URL (em português) -> na API. */
export const DEPOSIT_STATUS_PARAMS: Readonly<Record<string, DepositStatus>> = {
  pendente: 'PENDING',
  'em-analise': 'REVIEW',
  pago: 'PAID',
  expirado: 'EXPIRED',
  cancelado: 'CANCELED',
  recusado: 'REJECTED',
};

export const DEPOSIT_STATUS_LABELS: Readonly<Record<DepositStatus, string>> = {
  PENDING: 'Pendente',
  REVIEW: 'Em análise',
  PAID: 'Pago',
  EXPIRED: 'Expirado',
  CANCELED: 'Cancelado',
  REJECTED: 'Recusado',
};

export interface WalletMovementConfig {
  title: string;
  href: string;
  /** "depósito" / "saque", para as mensagens. */
  noun: string;
  statuses: readonly StatusOption[];
  /** Colunas da lista (a lista ainda vem vazia). */
  columns: readonly string[];
}

export const WALLET_MOVEMENTS: Readonly<Record<WalletMovementKind, WalletMovementConfig>> = {
  deposits: {
    title: 'Depósitos',
    href: ADMIN_ROUTES.deposits,
    noun: 'depósito',
    statuses: [
      { param: 'pendente', label: 'Pendente' },
      { param: 'em-analise', label: 'Em análise' },
      { param: 'pago', label: 'Pago' },
      { param: 'expirado', label: 'Expirado' },
      { param: 'cancelado', label: 'Cancelado' },
      { param: 'recusado', label: 'Recusado' },
    ],
    columns: ['Data/Hora', 'Apostador', 'Pagador', 'Destino', 'Gateway', 'Valor', 'Status'],
  },
  withdrawals: {
    title: 'Saques',
    href: ADMIN_ROUTES.withdrawals,
    noun: 'saque',
    statuses: [
      { param: 'pendente', label: 'Pendente' },
      { param: 'aprovado', label: 'Aprovado' },
      { param: 'pago', label: 'Pago' },
      { param: 'recusado', label: 'Recusado' },
      { param: 'cancelado', label: 'Cancelado' },
    ],
    columns: ['ID', 'Data/Hora', 'Apostador', 'Chave Pix', 'Valor', 'Status'],
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WalletMovementsQuery {
  /** Houve pesquisa (a tela só mostra resultados depois de Pesquisar). */
  searched: boolean;
  /** Período (YYYY-MM-DD, Brasília), inclusivo; padrão: hoje. */
  from: string;
  to: string;
  /** '' = todos. */
  userId: string;
  promoterId: string;
  /** Status da lista do tipo; '' = todos. */
  status: string;
  page: number;
  pageSize: number;
}

/** Filtros no formato da API de depósitos. */
export interface DepositsApiQuery {
  from: string;
  to: string;
  page: number;
  pageSize: number;
  userId?: string;
  promoterId?: string;
  status?: DepositStatus;
}

export function depositsApiQuery(query: WalletMovementsQuery): DepositsApiQuery {
  return {
    from: query.from,
    to: query.to,
    page: query.page,
    pageSize: query.pageSize,
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.promoterId ? { promoterId: query.promoterId } : {}),
    ...(query.status ? { status: DEPOSIT_STATUS_PARAMS[query.status] } : {}),
  };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const uuidOf = (value: string | string[] | undefined) => {
  const id = first(value) ?? '';
  return UUID.test(id) ? id.toLowerCase() : '';
};

/** Filtros da URL com tolerância: valor inválido vira o padrão, nunca erro (a URL é digitável). */
export function parseWalletMovementsQuery(
  kind: WalletMovementKind,
  raw: Record<string, string | string[] | undefined>,
  nowIso: string,
): WalletMovementsQuery {
  const today = drawDateOf(nowIso, 0);
  const from = first(raw.de) ?? '';
  const to = first(raw.ate) ?? '';
  const valid = isValidPeriod(nowIso, from, to, OPERATION_SUMMARY_MAX_DAYS);
  const status = first(raw.status) ?? '';
  const page = Number(first(raw.page));
  return {
    searched: valid,
    from: valid ? from : today,
    to: valid ? to : today,
    userId: uuidOf(raw.apostador),
    promoterId: uuidOf(raw.promotor),
    status: WALLET_MOVEMENTS[kind].statuses.some((option) => option.param === status) ? status : '',
    page: Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1,
    pageSize: parsePageSize(raw.pageSize),
  };
}

/** Endereço da lista com os filtros (o período sempre vai: é ele que marca "pesquisado"); omite o que é padrão. */
export function walletMovementsHref(
  kind: WalletMovementKind,
  query: Omit<WalletMovementsQuery, 'searched' | 'page' | 'pageSize'> & { page?: number; pageSize?: number },
): string {
  const params = new URLSearchParams({ de: query.from, ate: query.to });
  if (query.userId) params.set('apostador', query.userId);
  if (query.status) params.set('status', query.status);
  if (query.promoterId) params.set('promotor', query.promoterId);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  if (query.pageSize && query.pageSize !== parsePageSize(undefined)) params.set('pageSize', String(query.pageSize));
  return `${WALLET_MOVEMENTS[kind].href}?${params}`;
}
