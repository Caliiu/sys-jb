import type { CrmInactiveRow, CrmNeverDepositedRow, CrmPlayerType } from '@sysjb/contracts';
import { formatCents } from '../currency';
import { formatDateTime } from '../datetime';
import { maskPhoneInput } from '../masks';
import { csvCell } from './users-csv';

export const CRM_TYPE_LABELS: Record<CrmPlayerType, string> = { player: 'Apostador', promoter: 'Promotor' };

const promoterOf = (row: CrmNeverDepositedRow) =>
  row.promoter ? `${row.promoter.displayId} - ${row.promoter.name}` : '';

/** Mesmo padrão do CSV de apostadores: ";" entre colunas, CRLF e BOM UTF-8 (acentos certos no Excel). */
const toCsv = (rows: string[][]) => `﻿${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;

export function crmInactiveCsv(items: CrmInactiveRow[]): string {
  return toCsv([
    [
      'Código',
      'Nome',
      'Tipo',
      'Promotor associado',
      'Telefone',
      'Valor total depositado',
      'Dias sem depositar',
      'Último depósito',
      'Dias de relacionamento',
      'Depósitos feitos',
    ],
    ...items.map((row) => [
      String(row.player.displayId),
      row.player.name,
      CRM_TYPE_LABELS[row.type],
      promoterOf(row),
      maskPhoneInput(row.phone),
      formatCents(row.totalDepositedCents),
      String(row.daysWithoutDeposit),
      formatDateTime(row.lastDepositAt),
      String(row.relationshipDays),
      String(row.deposits),
    ]),
  ]);
}

export function crmNeverDepositedCsv(items: CrmNeverDepositedRow[]): string {
  return toCsv([
    ['Código', 'Nome', 'Tipo', 'Promotor associado', 'Telefone', 'Cadastro', 'Dias de relacionamento'],
    ...items.map((row) => [
      String(row.player.displayId),
      row.player.name,
      CRM_TYPE_LABELS[row.type],
      promoterOf(row),
      maskPhoneInput(row.phone),
      formatDateTime(row.createdAt),
      String(row.relationshipDays),
    ]),
  ]);
}
