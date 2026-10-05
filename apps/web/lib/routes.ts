/** Rotas do app do cliente (fonte única para links, menu lateral e navegação inferior). */
export const ROUTES = {
  home: '/',
  lotteries: '/loterias',
  prizeCalculator: '/loterias/calcular',
  horoscope: '/loterias/horoscopo',
  overdue: '/loterias/atrasados',
  fazendinha: '/fazendinha',
  casino: '/cassino',
  results: '/resultados',
  lotteryResults: '/resultados/loterias',
  reports: '/relatorios',
  quotes: '/relatorios/cotacoes',
  balanceReport: '/relatorios/saldo',
  lotteryMovement: '/relatorios/movimento',
  puleLookup: '/relatorios/pule',
  puleByCode: '/relatorios/pule/codigo',
  puleByDate: '/relatorios/pule/data',
  prizes: '/premiadas',
  prizesCheck: '/premiadas/consultar',
  prizeClaim: '/premiadas/reclame',
  pixTopUp: '/recarga-pix',
  withdrawals: '/saques',
  howToPlay: '/como-jogar',
  settings: '/configuracoes',
  profile: '/perfil',
} as const;

/** Máximo de extrações num resultado (a banca tem poucas dezenas; protege a URL digitada). */
const MAX_RESULT_DRAWS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ids de `?sorteios=` do link que abre os resultados já no resultado (notificação "Resultado saiu"), com tolerância
 * (a URL é digitável): só UUIDs, sem repetir, até o máximo.
 */
export function parseResultDrawIds(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const ids = (value ?? '')
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter((id) => UUID.test(id));
  return [...new Set(ids)].slice(0, MAX_RESULT_DRAWS);
}

/** Atrasados de um sorteio da banca (id). */
export const overdueOf = (drawId: string) => `${ROUTES.overdue}?sorteio=${encodeURIComponent(drawId)}`;

/** Id de `?sorteio=` (a URL é digitável): só um UUID; o resto vira null. */
export function parseOverdueDrawId(raw: string | string[] | undefined): string | null {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase() ?? '';
  return UUID.test(value) ? value : null;
}

/** Premiadas de um dia (YYYY-MM-DD). */
export const prizesOfDate = (date: string) => `${ROUTES.prizesCheck}/${date}`;

/** Relatórios de um dia (YYYY-MM-DD). */
export const balanceOfDate = (date: string) => `${ROUTES.balanceReport}/${date}`;
export const movementOfDate = (date: string) => `${ROUTES.lotteryMovement}/${date}`;
export const pulesOfDate = (date: string) => `${ROUTES.puleByDate}/${date}`;

/** Recibo de uma pule; `listDate` = veio da lista desse dia (o voltar leva de volta a ela). */
export const puleReceipt = (puleNumber: number, listDate?: string) =>
  `${ROUTES.puleLookup}/${puleNumber}${listDate ? `?lista=${listDate}` : ''}`;

/** Imagem de um mural (a versão muda a cada alteração, para o navegador não usar a do cache). */
export const muralImage = (id: string, version: string) => `/mural/${id}/imagem?v=${version}`;
