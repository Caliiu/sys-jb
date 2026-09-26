import type { OperatorRole, UserStatus } from '@sysjb/contracts';

export const ROLE_LABELS: Record<OperatorRole, string> = {
  MANAGER: 'Gerente',
  FINANCE: 'Financeiro',
  SUPPORT: 'Suporte',
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Ativo',
  BLOCKED: 'Bloqueado',
};
