import { type GeneralReportType, OPERATION_SUMMARY_MAX_DAYS, drawDateOf } from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';
import { isValidPeriod } from './period';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tipo na URL (em português) -> o da API. */
const TYPE_PARAMS: Readonly<Record<string, GeneralReportType>> = { apostador: 'player', promotor: 'promoter' };
export const TYPE_PARAM_OF: Record<GeneralReportType, string> = { player: 'apostador', promoter: 'promotor' };

export interface CasinoGeneralQuery {
  /** Houve pesquisa (a tela só mostra os dados depois de Pesquisar). */
  searched: boolean;
  /** Período (YYYY-MM-DD, Brasília), inclusivo; padrão: hoje. */
  from: string;
  to: string;
  /** '' = todos. */
  promoterId: string;
  userId: string;
  type: GeneralReportType | '';
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const uuidOf = (value: string | string[] | undefined) => {
  const id = first(value) ?? '';
  return UUID.test(id) ? id.toLowerCase() : '';
};

/** Filtros da URL com tolerância: período inválido = não pesquisou (abre em hoje); id ou tipo inválido = todos. */
export function parseCasinoGeneralQuery(
  raw: Record<string, string | string[] | undefined>,
  nowIso: string,
): CasinoGeneralQuery {
  const today = drawDateOf(nowIso, 0);
  const from = first(raw.de) ?? '';
  const to = first(raw.ate) ?? '';
  const valid = isValidPeriod(nowIso, from, to, OPERATION_SUMMARY_MAX_DAYS);
  const type = first(raw.tipo) ?? '';
  return {
    searched: valid,
    from: valid ? from : today,
    to: valid ? to : today,
    promoterId: uuidOf(raw.promotor),
    userId: uuidOf(raw.apostador),
    type: (Object.hasOwn(TYPE_PARAMS, type) ? TYPE_PARAMS[type] : undefined) ?? '',
  };
}

/** Endereço do relatório com os filtros (o período sempre vai: é ele que marca "pesquisado"). */
export function casinoGeneralHref(query: Omit<CasinoGeneralQuery, 'searched'>): string {
  const params = new URLSearchParams({ de: query.from, ate: query.to });
  if (query.promoterId) params.set('promotor', query.promoterId);
  if (query.userId) params.set('apostador', query.userId);
  if (query.type) params.set('tipo', TYPE_PARAM_OF[query.type]);
  return `${ADMIN_ROUTES.casinoGeneralReport}?${params}`;
}
