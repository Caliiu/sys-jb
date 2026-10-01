/**
 * Rotas do painel administrativo (fonte única para links, redirecionamentos e navegação). São os caminhos
 * do host do painel (admin.<domínio>): o rewrite do next.config acrescenta o prefixo /admin por baixo.
 */
export const ADMIN_ROUTES = {
  login: '/login',
  home: '/',
  // Operação
  users: '/usuarios',
  user: (id: string) => `/usuarios/${id}`,
  /** CSV da lista de apostadores (rota, não página). */
  usersExport: '/usuarios/exportar',
  tickets: '/bilhetes',
  prizes: '/premios',
  operationSummary: '/resumo-operacao',
  // Relatórios
  generalReport: '/relatorios/geral',
  casinoGeneralReport: '/relatorios/cassino/geral',
  casinoClosingReport: '/relatorios/cassino/fechamento',
  salesByDrawReport: '/relatorios/loterias/vendas-por-extracao',
  // Carteira
  deposits: '/depositos',
  statement: '/extrato',
  withdrawals: '/saques',
  // CRM
  inactivePlayers: '/crm/inativos',
  neverDeposited: '/crm/nunca-depositantes',
  // Configurações
  billingGroups: '/configuracoes/grupos-cobranca',
  routes: '/configuracoes/rotas',
  sections: '/configuracoes/secoes',
  quotes: '/cotacoes',
  draws: '/sorteios',
  murals: '/mural',
  /** Imagem do mural (a versão muda a cada alteração, para o navegador não usar a do cache). */
  muralImage: (id: string, version: string) => `/mural/${id}/imagem?v=${version}`,
  /** Personalização: abas Identidade visual e Cards do início. */
  branding: '/personalizacao',
  homeLayout: '/personalizacao/cards-inicio',
  /** Valores: "Indique e ganhe" e o fechamento mensal das comissões (antes, Carteira > Comissões em /comissoes). */
  values: '/personalizacao/valores',
  // Administração (rodapé do menu)
  audit: '/auditoria',
} as const;
