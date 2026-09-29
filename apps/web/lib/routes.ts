/** Rotas do app do cliente (fonte única para links, menu lateral e navegação inferior). */
export const ROUTES = {
  home: '/',
  lotteries: '/loterias',
  prizeCalculator: '/loterias/calcular',
  fazendinha: '/fazendinha',
  results: '/resultados',
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
  settings: '/configuracoes',
  profile: '/perfil',
} as const;

/** Premiadas de um dia (YYYY-MM-DD). */
export const prizesOfDate = (date: string) => `${ROUTES.prizesCheck}/${date}`;

/** Relatórios de um dia (YYYY-MM-DD). */
export const balanceOfDate = (date: string) => `${ROUTES.balanceReport}/${date}`;
export const movementOfDate = (date: string) => `${ROUTES.lotteryMovement}/${date}`;
export const pulesOfDate = (date: string) => `${ROUTES.puleByDate}/${date}`;

/** Recibo de uma pule; `listDate` = veio da lista desse dia (o voltar leva de volta a ela). */
export const puleReceipt = (puleNumber: number, listDate?: string) =>
  `${ROUTES.puleLookup}/${puleNumber}${listDate ? `?lista=${listDate}` : ''}`;
