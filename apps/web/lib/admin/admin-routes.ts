/**
 * Rotas do painel administrativo (fonte única para links, redirecionamentos e navegação). São os caminhos
 * do host do painel (admin.<domínio>): o `proxy.ts` acrescenta o prefixo /admin por baixo.
 */
export const ADMIN_ROUTES = {
  login: '/login',
  users: '/usuarios',
  user: (id: string) => `/usuarios/${id}`,
  /** CSV da lista de usuários (rota, não página). */
  usersExport: '/usuarios/exportar',
  audit: '/auditoria',
  commissions: '/comissoes',
  quotes: '/cotacoes',
  draws: '/sorteios',
  branding: '/identidade-visual',
  homeLayout: '/cards-inicio',
  murals: '/mural',
  /** Imagem do mural (a versão muda a cada alteração, para o navegador não usar a do cache). */
  muralImage: (id: string, version: string) => `/mural/${id}/imagem?v=${version}`,
} as const;
