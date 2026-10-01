import { ADMIN_PRIZE_FILTER_MAX_CENTS, ADMIN_PRIZES_MAX_DAYS, drawDateOf } from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';
import { isValidPeriod } from './period';
import { DEFAULT_PAGE_SIZE, parsePageSize } from './page-size';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PrizesQuery {
  /** Houve pesquisa (a tela só mostra resultados depois de Pesquisar). */
  searched: boolean;
  /** Período pela data do jogo (YYYY-MM-DD, Brasília), inclusivo; padrão: hoje. */
  from: string;
  to: string;
  page: number;
  pageSize: number;
  /** '' = todos. */
  promoterId: string;
  userId: string;
  drawId: string;
  /** Faixa do prêmio em centavos; null = sem limite. */
  minPrizeCents: number | null;
  maxPrizeCents: number | null;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const uuidOf = (value: string | string[] | undefined) => {
  const id = first(value) ?? '';
  return UUID.test(id) ? id.toLowerCase() : '';
};

/**
 * Valor em reais digitado no filtro ("1.500", "1.500,50", "1500.5") -> centavos. Vazio ou inválido = null (sem limite).
 * Com vírgula, o ponto é separador de milhar; sem vírgula, um ponto seguido de 1 ou 2 dígitos é decimal.
 */
export function parseReais(raw: string | string[] | undefined): number | null {
  const text = (first(raw) ?? '').trim().replace(/^R\$\s*/i, '');
  if (!text) return null;
  let normalized: string;
  if (text.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(text)) return null;
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+(\.\d{1,2})?$/.test(text)) {
    normalized = text;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, '');
  } else {
    return null;
  }
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= ADMIN_PRIZE_FILTER_MAX_CENTS ? cents : null;
}

/** Centavos -> texto do campo ("1500,50"; inteiro sem decimais). */
export function reaisText(cents: number | null): string {
  if (cents === null) return '';
  const reais = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(reais) : `${reais},${String(rest).padStart(2, '0')}`;
}

/** Período válido: datas reais, até hoje, início antes do fim e até ADMIN_PRIZES_MAX_DAYS dias. */
export const isPrizesPeriod = (nowIso: string, from: string, to: string) =>
  isValidPeriod(nowIso, from, to, ADMIN_PRIZES_MAX_DAYS);

/** Filtros da URL com tolerância: valor inválido vira o padrão, nunca erro (a URL é digitável). */
export function parsePrizesQuery(raw: Record<string, string | string[] | undefined>, nowIso: string): PrizesQuery {
  const today = drawDateOf(nowIso, 0);
  const from = first(raw.de) ?? '';
  const to = first(raw.ate) ?? '';
  const validPeriod = isPrizesPeriod(nowIso, from, to);
  const page = Number(first(raw.page));
  let minPrizeCents = parseReais(raw.min);
  let maxPrizeCents = parseReais(raw.max);
  // Faixa invertida (digitação): troca em vez de não achar nada.
  if (minPrizeCents !== null && maxPrizeCents !== null && minPrizeCents > maxPrizeCents) {
    [minPrizeCents, maxPrizeCents] = [maxPrizeCents, minPrizeCents];
  }
  return {
    searched: validPeriod,
    from: validPeriod ? from : today,
    to: validPeriod ? to : today,
    page: Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1,
    pageSize: parsePageSize(raw.pageSize),
    promoterId: uuidOf(raw.promotor),
    userId: uuidOf(raw.apostador),
    drawId: uuidOf(raw.extracao),
    minPrizeCents,
    maxPrizeCents,
  };
}

/** Endereço da lista com os filtros (o período sempre vai: é ele que marca "pesquisado"); omite o que é padrão. */
export function prizesHref(query: Partial<PrizesQuery> & { from: string; to: string }): string {
  const params = new URLSearchParams({ de: query.from, ate: query.to });
  if (query.drawId) params.set('extracao', query.drawId);
  if (query.promoterId) params.set('promotor', query.promoterId);
  if (query.userId) params.set('apostador', query.userId);
  if (query.minPrizeCents != null) params.set('min', reaisText(query.minPrizeCents));
  if (query.maxPrizeCents != null) params.set('max', reaisText(query.maxPrizeCents));
  if (query.pageSize && query.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(query.pageSize));
  if (query.page && query.page > 1) params.set('page', String(query.page));
  return `${ADMIN_ROUTES.prizes}?${params}`;
}
