/**
 * CRM do painel (Apostadores inativos e Nunca depositantes): listas de contas ativas para reativar ou converter.
 * Depósito = Recarga Pix paga (crédito pelo painel não conta). Dias contados no calendário de Brasília. Valores em
 * centavos.
 */
import type { Page } from './admin.js';

/** Inativos: já depositou e está há X–Y dias sem depositar. Nunca depositantes: cadastrado há X–Y dias, sem depósito. */
export const CRM_LISTS = ['inactive', 'never-deposited'] as const;
export type CrmList = (typeof CRM_LISTS)[number];

export const CRM_LIMITS = {
  /** Faixa de dias aceita nos filtros (10 anos). */
  maxDays: 3650,
  /** Atalhos dos filtros (dias). */
  shortcuts: [7, 15, 30, 60] as const,
  /** Linhas no "Exportar Excel". */
  exportMaxRows: 10_000,
} as const;

/** Ordenações de cada lista (as colunas da tela). */
export const CRM_INACTIVE_SORTS = [
  'name',
  'type',
  'promoter',
  'code',
  'phone',
  'totalDeposited',
  'daysWithoutDeposit',
  'relationshipDays',
  'deposits',
] as const;
export type CrmInactiveSort = (typeof CRM_INACTIVE_SORTS)[number];

export const CRM_NEVER_DEPOSITED_SORTS = ['name', 'type', 'promoter', 'code', 'phone', 'relationshipDays'] as const;
export type CrmNeverDepositedSort = (typeof CRM_NEVER_DEPOSITED_SORTS)[number];

export type CrmPlayerType = 'player' | 'promoter';

/** Colunas comuns às duas listas. */
export interface CrmPlayerRow {
  player: { id: string; displayId: number; name: string };
  type: CrmPlayerType;
  /** Promotor que indicou (só se quem indicou é promotor). */
  promoter: { id: string; displayId: number; name: string } | null;
  /** Celular (só dígitos, com DDD). */
  phone: string;
  /** Dias desde o cadastro (calendário de Brasília). */
  relationshipDays: number;
  /** ISO 8601 do cadastro. */
  createdAt: string;
}

export interface CrmInactiveRow extends CrmPlayerRow {
  /** Soma das Recargas Pix pagas. */
  totalDepositedCents: number;
  /** Dias desde o último depósito pago. */
  daysWithoutDeposit: number;
  /** Quantidade de Recargas Pix pagas. */
  deposits: number;
  /** ISO 8601 do último depósito pago. */
  lastDepositAt: string;
}

export type CrmNeverDepositedRow = CrmPlayerRow;

/** Faixa de dias do filtro (inclusiva). */
export interface CrmDaysRange {
  minDays: number;
  maxDays: number;
}

export type CrmInactiveList = Page<CrmInactiveRow> & CrmDaysRange;
export type CrmNeverDepositedList = Page<CrmNeverDepositedRow> & CrmDaysRange;

/** GET /v1/admin/crm/inactive e /never-deposited: faixa de dias, promotor, ordenação e paginação. */
export interface CrmListQuery<Sort extends string> extends CrmDaysRange {
  promoterId?: string;
  sort?: Sort;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}
