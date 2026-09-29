import type { AuditPeriod } from '@sysjb/contracts';

/** Brasília é UTC-3 o ano todo (sem horário de verão desde 2019). */
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DAYS_BACK: Record<AuditPeriod, number> = { today: 0, '7d': 6, '30d': 29 };

/** Início (instante UTC) do período: meia-noite de Brasília de hoje, menos os dias anteriores incluídos. */
export function auditPeriodStart(period: AuditPeriod, now: Date = new Date()): Date {
  const brasiliaMidnight = Math.floor((now.getTime() - BRASILIA_OFFSET_MS) / DAY_MS) * DAY_MS + BRASILIA_OFFSET_MS;
  return new Date(brasiliaMidnight - DAYS_BACK[period] * DAY_MS);
}
