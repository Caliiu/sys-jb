import { DRAW_MAX_DAY_OFFSET, OPERATION_SUMMARY_MAX_DAYS, drawDateOf } from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';
import { isValidPeriod } from './period';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SalesByDrawQuery {
  /** Houve pesquisa (a tela só mostra os dados depois de Pesquisar). */
  searched: boolean;
  /** Período pela data do jogo (YYYY-MM-DD, Brasília), inclusivo; padrão: hoje. */
  from: string;
  to: string;
  /** '' = todos. */
  promoterId: string;
  userId: string;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const uuidOf = (value: string | string[] | undefined) => {
  const id = first(value) ?? '';
  return UUID.test(id) ? id.toLowerCase() : '';
};

/** Maior data do jogo aceita: o fim da janela de apostas (as vendas para os próximos dias também contam). */
export const salesByDrawMaxDate = (nowIso: string) => drawDateOf(nowIso, DRAW_MAX_DAY_OFFSET);

/** Filtros da URL com tolerância: período inválido = não pesquisou (abre em hoje); id inválido = todos. */
export function parseSalesByDrawQuery(
  raw: Record<string, string | string[] | undefined>,
  nowIso: string,
): SalesByDrawQuery {
  const today = drawDateOf(nowIso, 0);
  const from = first(raw.de) ?? '';
  const to = first(raw.ate) ?? '';
  const valid = isValidPeriod(nowIso, from, to, OPERATION_SUMMARY_MAX_DAYS, DRAW_MAX_DAY_OFFSET);
  return {
    searched: valid,
    from: valid ? from : today,
    to: valid ? to : today,
    promoterId: uuidOf(raw.promotor),
    userId: uuidOf(raw.apostador),
  };
}

/** Endereço do relatório com os filtros (o período sempre vai: é ele que marca "pesquisado"). */
export function salesByDrawHref(query: Omit<SalesByDrawQuery, 'searched'>): string {
  const params = new URLSearchParams({ de: query.from, ate: query.to });
  if (query.promoterId) params.set('promotor', query.promoterId);
  if (query.userId) params.set('apostador', query.userId);
  return `${ADMIN_ROUTES.salesByDrawReport}?${params}`;
}
