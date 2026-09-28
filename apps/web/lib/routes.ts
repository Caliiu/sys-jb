/** Rotas do app do cliente (fonte única para links, menu lateral e navegação inferior). */
export const ROUTES = {
  home: '/',
  lotteries: '/loterias',
  prizeCalculator: '/loterias/calcular',
  fazendinha: '/fazendinha',
  results: '/resultados',
  reports: '/relatorios',
  quotes: '/relatorios/cotacoes',
  prizes: '/premiadas',
  pixTopUp: '/recarga-pix',
  withdrawals: '/saques',
  settings: '/configuracoes',
  profile: '/perfil',
} as const;
