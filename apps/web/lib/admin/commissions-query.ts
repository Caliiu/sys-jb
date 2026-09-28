import { brasiliaNow } from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';

const MONTH_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;

const format = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

/** Mês `offset` meses antes do mês corrente em Brasília (0 = este mês). */
export function monthBefore(nowIso: string, offset: number): string {
  const { year, month } = brasiliaNow(nowIso);
  const index = year * 12 + (month - 1) - offset;
  return format(Math.floor(index / 12), (index % 12) + 1);
}

/** Mês da URL (?mes=AAAA-MM); sem ou inválido, o mês passado (o próximo a fechar). */
export function parseCommissionMonth(raw: Record<string, string | string[] | undefined>, nowIso: string): string {
  const value = Array.isArray(raw.mes) ? raw.mes[0] : raw.mes;
  return value && MONTH_RE.test(value) ? value : monthBefore(nowIso, 1);
}

/** Opções do seletor: este mês (prévia parcial) e os 12 anteriores. */
export const recentMonths = (nowIso: string) => Array.from({ length: 13 }, (_, i) => monthBefore(nowIso, i));

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** "2026-08" -> "agosto de 2026". */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} de ${year}`;
}

export const commissionsHref = (month: string) => `${ADMIN_ROUTES.commissions}?mes=${month}`;
