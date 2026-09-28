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
  'audit.read',
  'wallet.adjust',
  'commissions.read',
  'commissions.manage',
  'quotes.read',
  'quotes.manage',
  'draws.read',
  'draws.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissões de cada perfil (fonte única, usada pela API para autorizar e pelo web para
 * decidir o que mostrar; a API é quem garante).
 * - MANAGER (Gerente): tudo (inclusive promover a promotor, definir a comissão, ver a auditoria e creditar
 *   carteiras; o banco confere o perfil de novo no crédito — ver migration operator_wallet_credit).
 * - SUPPORT (Suporte): consulta e corrige dados de cadastro; não bloqueia; não vê promotores.
 * - FINANCE (Financeiro): somente consulta (usuários, promotores, comissões, cotações e sorteios).
 * Cotações: `quotes.manage` edita a tabela de prêmios da banca (Tradicional e Fazendinha).
 * Sorteios: `draws.manage` cadastra/altera sorteios e exceções de data (o banco recusa o que deixaria apostas
 * vendidas sem sorteio).
 * Comissões: `commissions.manage` define a % do "Indique e ganhe" e fecha o mês (o banco confere o perfil
 * MANAGER de novo no fechamento).
 */
export const ROLE_PERMISSIONS: Readonly<Record<OperatorRole, readonly Permission[]>> = {
  MANAGER: [
    'users.read',
    'users.update',
    'users.status',
    'promoters.read',
    'promoters.manage',
    'audit.read',
    'wallet.adjust',
    'commissions.read',
    'commissions.manage',
    'quotes.read',
    'quotes.manage',
    'draws.read',
    'draws.manage',
  ],
  SUPPORT: ['users.read', 'users.update'],
  FINANCE: ['users.read', 'promoters.read', 'commissions.read', 'quotes.read', 'draws.read'],
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
  /** Quem indicou o usuário no cadastro (jogador ou promotor); null = veio sem convite. */
  referredBy: { id: string; displayId: number; name: string } | null;
  /** O mesmo "indicado por", só quando essa pessoa é promotor (ganha a % de promotor além da de indicação). */
  promoter: { id: string; displayId: number; name: string } | null;
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
  /** Código do link de convite deste usuário. */
  inviteCode: string;
  status: UserStatus;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601 do último login; null se nunca entrou. */
  lastLoginAt: string | null;
  wallet: PublicWallet;
  /** Comissão em centésimos de % (1 a 10000); null = não é promotor. */
  promoterCommissionBps: number | null;
  /**
   * Quem indicou este usuário no cadastro (jogador comum ou promotor); null = veio sem convite.
   * `promoterCommissionBps` não nulo = quem indicou é promotor (ganha indicação + promotor).
   */
  referredBy: { id: string; displayId: number; name: string; promoterCommissionBps: number | null } | null;
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
  /** Código do link de convite do promotor. */
  inviteCode: string;
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

/** Ações registradas na trilha de auditoria (sempre sobre um usuário da banca). */
export const AUDIT_ACTIONS = [
  'user.update',
  'user.block',
  'user.unblock',
  'promoter.enable',
  'promoter.update',
  'promoter.disable',
  'wallet.credit',
  'commission.rate',
  'commission.close',
  'quote.update',
  'draw.create',
  'draw.update',
  'draw.delete',
  'draw.exception.create',
  'draw.exception.delete',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Registro da auditoria: quem fez o quê, em quem e quando. Nunca traz valores pessoais. */
export interface AdminAuditEntry {
  id: string;
  /** ISO 8601. */
  createdAt: string;
  action: AuditAction;
  operator: { id: string; name: string; email: string };
  /** 'tenant' = ação sobre a banca (ex.: % de indicação, fechamento do mês); aí `target` é null. */
  targetType: 'user' | 'tenant';
  /** Usuário afetado; null em ações sobre a banca ou se o usuário não existir mais nesta banca. */
  target: { id: string; displayId: number; name: string } | null;
  /**
   * Nomes dos campos alterados; na comissão, antes/depois em centésimos de %; no crédito de carteira, o
   * valor em centavos (fields = a bolsa creditada).
   */
  details: AuditDetails | null;
}

/**
 * Metadados da ação (nunca valores pessoais): nomes dos campos alterados; na comissão, antes/depois em
 * centésimos de %; no crédito de carteira, o valor em centavos; nos sorteios, o nome do sorteio e a data.
 */
export type AuditDetails = {
  fields: string[];
  from?: number | null;
  to?: number | null;
  amount?: number;
  month?: string;
  draw?: string;
  date?: string;
};

/** GET /v1/admin/audit: mais recentes primeiro; filtros opcionais por ação e por usuário afetado. */
export interface AdminAuditQuery {
  page?: number;
  pageSize?: number;
  action?: AuditAction;
  /** id (UUID) do usuário afetado. */
  userId?: string;
}

/** Bolsas que o painel pode creditar: saldo, bônus e disponível em games. */
export const WALLET_CREDIT_BUCKETS = ['balance', 'bonus', 'games'] as const;
export type WalletCreditBucket = (typeof WALLET_CREDIT_BUCKETS)[number];

/** Maior crédito numa operação: R$ 100.000,00 (em centavos). O banco confere o mesmo limite. */
export const MAX_WALLET_CREDIT_CENTS = 10_000_000;

/** POST /v1/admin/users/:id/wallet/credits: credita a carteira. Responde com o detalhe do usuário. */
export interface AdminWalletCreditRequest {
  /** UUID gerado pelo painel por tentativa: repetir a mesma chave não credita de novo. */
  idempotencyKey: string;
  bucket: WalletCreditBucket;
  /** Centavos, de 1 a MAX_WALLET_CREDIT_CENTS. */
  amountCents: number;
  /** Motivo (3 a 200 caracteres), guardado no registro de movimentações. */
  note: string;
}

/** "Indique e ganhe" da banca: % (centésimos) do valor apostado pelos indicados. 0 = desligado. */
export interface AdminCommissionSettings {
  referralCommissionBps: number;
}

/** PUT /v1/admin/commissions/settings. */
export interface SetCommissionSettingsRequest {
  referralCommissionBps: number;
}

/** PAID = recebe (ou recebeu); BLOCKED = quem indicou está bloqueado e não recebe; ZERO = nada a receber. */
export const COMMISSION_PAYOUT_STATUSES = ['PAID', 'BLOCKED', 'ZERO'] as const;
export type CommissionPayoutStatus = (typeof COMMISSION_PAYOUT_STATUSES)[number];

/** Linha do mês: quanto os indicados de um usuário apostaram e quanto ele ganha. */
export interface AdminCommissionRow {
  user: { id: string; displayId: number; name: string; status: UserStatus };
  wageredCents: number;
  referralRateBps: number;
  /** 0 quando quem indicou não é promotor. */
  promoterRateBps: number;
  amountCents: number;
  status: CommissionPayoutStatus;
}

/**
 * GET /v1/admin/commissions/months/:month (YYYY-MM). Mês aberto = prévia calculada agora (percentuais de
 * hoje); mês fechado = o que foi pago, como ficou gravado.
 */
export interface AdminCommissionMonth {
  /** YYYY-MM. */
  month: string;
  closed: { closedAt: string; operatorName: string; totalPaidCents: number } | null;
  /** O mês já terminou (Brasília) e ainda não foi fechado. */
  canClose: boolean;
  rows: AdminCommissionRow[];
  totals: { wageredCents: number; paidCents: number };
}

/** GET /v1/admin/commissions/closings: meses já fechados, mais recentes primeiro. */
export interface AdminCommissionClosing {
  month: string;
  closedAt: string;
  operatorName: string;
  totalPaidCents: number;
}
