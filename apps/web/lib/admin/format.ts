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

// Fuso fixo (Brasília): servidor e navegador formatam igual, sem divergência de hidratação.
const DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' });
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

/** ISO 8601 -> "25/09/2026" */
export const formatDate = (iso: string): string => DATE.format(new Date(iso));

/** ISO 8601 -> "25/09/2026 14:30" */
export const formatDateTime = (iso: string): string => DATE_TIME.format(new Date(iso)).replace(', ', ' ');

/** "1990-05-17" (data de calendário, sem fuso) -> "17/05/1990" */
export function formatBirthDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}
