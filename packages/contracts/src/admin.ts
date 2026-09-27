/**
 * Contratos do painel administrativo (operadores, perfis, usuários vistos pelo operador).
 * Sem dependências de servidor: a API e o web importam daqui.
 */
import type { PublicTenant, PublicWallet } from './index.js';

export const USER_STATUSES = ['ACTIVE', 'BLOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const OPERATOR_ROLES = ['MANAGER', 'FINANCE', 'SUPPORT'] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export const PERMISSIONS = [
  'users.read',
  'users.update',
  'users.status',
  'promoters.read',
  'promoters.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissões de cada perfil (fonte única, usada pela API para autorizar e pelo web para
 * decidir o que mostrar; a API é quem garante).
 * - MANAGER (Gerente): tudo (inclusive promover a promotor e definir a comissão).
 * - SUPPORT (Suporte): consulta e corrige dados de cadastro; não bloqueia; não vê promotores.
 * - FINANCE (Financeiro): somente consulta (usuários e promotores).
 */
export const ROLE_PERMISSIONS: Readonly<Record<OperatorRole, readonly Permission[]>> = {
  MANAGER: ['users.read', 'users.update', 'users.status', 'promoters.read', 'promoters.manage'],
  SUPPORT: ['users.read', 'users.update'],
  FINANCE: ['users.read', 'promoters.read'],
};

export function hasPermission(role: OperatorRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export interface PublicOperator {
  id: string;
  name: string;
  email: string;
  role: OperatorRole;
  permissions: readonly Permission[];
}

export interface OperatorLoginRequest {
  email: string;
  password: string;
}

/** Como no login do cliente, o token é opaco e fica só no servidor do web (cookie HttpOnly). */
export interface OperatorLoginResponse {
  token: string;
  /** ISO 8601. */
  expiresAt: string;
  operator: PublicOperator;
}

/** Quem está logado no painel e de qual banca (a banca vem do operador, nunca do endereço acessado). */
export interface OperatorMeResponse {
  operator: PublicOperator;
  tenant: PublicTenant;
}

/** Linha da lista de usuários. CPF e telefone: só dígitos (a tela formata). */
export interface AdminUserListItem {
  id: string;
  displayId: number;
  name: string;
  document: string;
  phone: string;
  status: UserStatus;
  /** ISO 8601. */
  createdAt: string;
}

export interface AdminUserDetail {
  id: string;
  displayId: number;
  name: string;
  email: string | null;
  phone: string;
  document: string;
  /** YYYY-MM-DD. */
  birthDate: string;
  status: UserStatus;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601 do último login; null se nunca entrou. */
  lastLoginAt: string | null;
  wallet: PublicWallet;
  /** Comissão em centésimos de % (1 a 10000); null = não é promotor. */
  promoterCommissionBps: number | null;
  /** Promotor que indicou este usuário no cadastro; null = veio sem convite. */
  referredBy: { id: string; displayId: number; name: string } | null;
}

/** Comissão do promotor em centésimos de % (1 = 0,01%; 10000 = 100%). Inteiro: nunca ponto flutuante. */
export const MIN_COMMISSION_BPS = 1;
export const MAX_COMMISSION_BPS = 10_000;

/** Linha da lista de promotores. */
export interface AdminPromoterListItem {
  id: string;
  displayId: number;
  name: string;
  /** Só dígitos (a tela formata). */
  phone: string;
  status: UserStatus;
  commissionBps: number;
  /** Jogadores cadastrados pelo link de convite deste promotor. */
  referralsCount: number;
  /** ISO 8601. */
  createdAt: string;
}

/** PUT /v1/admin/promoters/:userId: promove o usuário a promotor ou altera a comissão. */
export interface SetPromoterRequest {
  commissionBps: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminUserListQuery {
  page?: number;
  pageSize?: number;
  /** Nome, CPF, telefone ou ID do usuário. */
  search?: string;
  status?: UserStatus;
}
