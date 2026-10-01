import { OPERATION_SUMMARY_MAX_DAYS, drawDateOf } from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';
import { isValidPeriod, presetRange } from './period';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OperationSummaryQuery {
  /** Período (YYYY-MM-DD, Brasília), inclusivo; padrão: o mês até hoje. */
  from: string;
  to: string;
  /** '' = todos. */
  promoterId: string;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Filtros da URL com tolerância: período inválido vira o mês até hoje, promotor inválido vira "todos". */
export function parseOperationSummaryQuery(
  raw: Record<string, string | string[] | undefined>,
  nowIso: string,
): OperationSummaryQuery {
  const from = first(raw.de) ?? '';
  const to = first(raw.ate) ?? '';
  const promoter = first(raw.promotor) ?? '';
  const period = isValidPeriod(nowIso, from, to, OPERATION_SUMMARY_MAX_DAYS)
    ? { from, to }
    : presetRange('month', drawDateOf(nowIso, 0));
  return { ...period, promoterId: UUID.test(promoter) ? promoter.toLowerCase() : '' };
}

/** Endereço do resumo com os filtros (omite o promotor quando é "todos"). */
export function operationSummaryHref(query: OperationSummaryQuery): string {
  const params = new URLSearchParams({ de: query.from, ate: query.to });
  if (query.promoterId) params.set('promotor', query.promoterId);
  return `${ADMIN_ROUTES.operationSummary}?${params}`;
}
