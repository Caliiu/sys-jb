/**
 * Contratos do painel administrativo (operadores, perfis, usuários vistos pelo operador).
 * Sem dependências de servidor: a API e o web importam daqui.
 */
import type { PublicWallet } from './index.js';

export const USER_STATUSES = ['ACTIVE', 'BLOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const OPERATOR_ROLES = ['MANAGER', 'FINANCE', 'SUPPORT'] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export const PERMISSIONS = ['users.read', 'users.update', 'users.status'] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissões de cada perfil (fonte única, usada pela API para autorizar e pelo web para
 * decidir o que mostrar; a API é quem garante).
 * - MANAGER (Gerente): tudo.
 * - SUPPORT (Suporte): consulta e corrige dados de cadastro; não bloqueia.
 * - FINANCE (Financeiro): somente consulta.
 */
export const ROLE_PERMISSIONS: Readonly<Record<OperatorRole, readonly Permission[]>> = {
  MANAGER: ['users.read', 'users.update', 'users.status'],
  SUPPORT: ['users.read', 'users.update'],
  FINANCE: ['users.read'],
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

/** Linha da lista de usuários: CPF e telefone mascarados. */
export interface AdminUserListItem {
  id: string;
  displayId: number;
  name: string;
  documentMasked: string;
  phoneMasked: string;
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

/** "52998224725" -> "***.982.247-**" */
export function maskDocument(document: string): string {
  return `***.${document.slice(3, 6)}.${document.slice(6, 9)}-**`;
}

/** "11912345678" -> "(11) *****-5678"; "1133334444" -> "(11) ****-4444" */
export function maskPhone(phone: string): string {
  const hidden = '*'.repeat(phone.length - 2 - 4);
  return `(${phone.slice(0, 2)}) ${hidden}-${phone.slice(-4)}`;
}
