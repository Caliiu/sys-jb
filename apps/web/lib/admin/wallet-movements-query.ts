import { OPERATION_SUMMARY_MAX_DAYS, drawDateOf } from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';
import { isValidPeriod } from './period';

/**
 * Carteira > Depósitos e Carteira > Saques: as mesmas telas de filtro, cada uma com os seus status. Os registros ainda
 * não existem no sistema (dependem da integração de pagamento); por isso os status ficam aqui, só na tela, até virarem
 * contrato da API.
 */
export type WalletMovementKind = 'deposits' | 'withdrawals';

interface StatusOption {
  /** Valor na URL (em português). */
  param: string;
  label: string;
}

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
      { param: 'pago', label: 'Pago' },
      { param: 'expirado', label: 'Expirado' },
      { param: 'cancelado', label: 'Cancelado' },
    ],
    columns: ['ID', 'Data/Hora', 'Apostador', 'Forma', 'Valor', 'Status'],
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
  return {
    searched: valid,
    from: valid ? from : today,
    to: valid ? to : today,
    userId: uuidOf(raw.apostador),
    promoterId: uuidOf(raw.promotor),
    status: WALLET_MOVEMENTS[kind].statuses.some((option) => option.param === status) ? status : '',
  };
}

/** Endereço da lista com os filtros (o período sempre vai: é ele que marca "pesquisado"); omite o que é padrão. */
export function walletMovementsHref(kind: WalletMovementKind, query: Omit<WalletMovementsQuery, 'searched'>): string {
  const params = new URLSearchParams({ de: query.from, ate: query.to });
  if (query.userId) params.set('apostador', query.userId);
  if (query.status) params.set('status', query.status);
  if (query.promoterId) params.set('promotor', query.promoterId);
  return `${WALLET_MOVEMENTS[kind].href}?${params}`;
}
