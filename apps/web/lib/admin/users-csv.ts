import type { AdminUserListItem } from '@sysjb/contracts';
import { formatBrl } from '../currency';
import { formatDateTime } from '../datetime';
import { maskCpfInput, maskPhoneInput } from '../masks';
import { formatCommission } from './commission';
import { STATUS_LABELS } from './format';

/** Máximo de linhas num arquivo (100 páginas da API). */
export const USERS_CSV_MAX_ROWS = 10_000;

const HEADER = [
  'ID',
  'Cadastro',
  'Nome',
  'Telefone',
  'CPF',
  'Promotor',
  'Comissão do promotor',
  'Indicado por',
  'Status',
  'Região',
  'Comissão',
  'Tabela',
  'M.Brinde',
  'Reter prêmio',
  'Limite diário',
];

const yesNo = (value: boolean) => (value ? 'Sim' : 'Não');

/**
 * Uma célula do CSV. Texto que começa com = + - @ (ou tab/CR) ganha um apóstrofo na frente: planilhas leriam
 * como fórmula (nome digitado pelo jogador nunca vira fórmula). Aspas, ";" e quebras de linha vão entre aspas.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * CSV dos apostadores no padrão das planilhas em português: ";" separa colunas, CRLF entre linhas e BOM UTF-8
 * (sem ele o Excel mostra os acentos errados).
 */
export function usersCsv(items: AdminUserListItem[]): string {
  const rows = items.map((user) => [
    String(user.displayId),
    formatDateTime(user.createdAt),
    user.name,
    maskPhoneInput(user.phone),
    maskCpfInput(user.document),
    user.promoter?.name ?? '',
    user.promoter ? formatCommission(user.promoter.commissionBps) : '',
    user.referredBy?.name ?? '',
    STATUS_LABELS[user.status],
    user.region ?? '',
    formatCommission(user.unitCommissionBps),
    user.quoteTable.name,
    yesNo(user.giftMilharEnabled),
    yesNo(user.retainPrizes),
    // Limite desligado: vazio (o valor pode continuar gravado para quando religar).
    user.dailyLimitEnabled && user.dailyLimitCents !== null ? formatBrl(user.dailyLimitCents) : '',
  ]);
  return `﻿${[HEADER, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}
