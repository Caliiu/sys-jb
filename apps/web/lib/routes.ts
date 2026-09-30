/** Rotas do app do cliente (fonte única para links, menu lateral e navegação inferior). */
export const ROUTES = {
  home: '/',
  lotteries: '/loterias',
  prizeCalculator: '/loterias/calcular',
  horoscope: '/loterias/horoscopo',
  fazendinha: '/fazendinha',
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

/** Resultado loterias de um dia (YYYY-MM-DD): escolha das extrações (as já escolhidas voltam marcadas). */
export const resultsOfDate = (date: string, drawIds: readonly string[] = []) =>
  `${ROUTES.lotteryResults}/${date}${drawIds.length > 0 ? `?sorteios=${drawIds.join(',')}` : ''}`;

/** Resultado das extrações escolhidas (ids dos sorteios da banca) num dia. */
export const resultsViewOf = (date: string, drawIds: readonly string[]) =>
  `${ROUTES.lotteryResults}/${date}/resultado?sorteios=${drawIds.join(',')}`;

/** Máximo de extrações num resultado (a banca tem poucas dezenas; protege a URL digitada). */
const MAX_RESULT_DRAWS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids de `?sorteios=` com tolerância (a URL é digitável): só UUIDs, sem repetir, até o máximo. */
export function parseResultDrawIds(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const ids = (value ?? '')
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter((id) => UUID.test(id));
  return [...new Set(ids)].slice(0, MAX_RESULT_DRAWS);
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
