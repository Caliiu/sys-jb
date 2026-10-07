import { casinoClosingMonths } from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';

const MONTH = /^20\d{2}-(0[1-9]|1[0-2])$/;
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

/**
 * Mês do detalhamento na URL (`?mes=AAAA-MM`). Tolerante: formato errado ou mês futuro = nenhum mês (a tela abre só
 * com os cards, nunca com erro).
 */
export function parseCasinoClosingMonth(
  raw: Record<string, string | string[] | undefined>,
  nowIso: string,
): string | null {
  const value = Array.isArray(raw.mes) ? raw.mes[0] : raw.mes;
  if (!value || !MONTH.test(value)) return null;
  return value <= casinoClosingMonths(nowIso).current ? value : null;
}

/** Endereço da tela com o detalhamento de um mês (sem mês: só os cards). */
export const casinoClosingHref = (month: string | null) =>
  month ? `${ADMIN_ROUTES.casinoClosingReport}?${new URLSearchParams({ mes: month })}` : ADMIN_ROUTES.casinoClosingReport;

/** "2026-09" → "setembro/2026". */
export function formatClosingMonth(month: string): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[index - 1]}/${year}`;
}
