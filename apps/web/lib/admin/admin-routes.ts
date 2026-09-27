/**
 * Rotas do painel administrativo (fonte única para links, redirecionamentos e navegação). São os caminhos
 * do host do painel (admin.<domínio>): o `proxy.ts` acrescenta o prefixo /admin por baixo.
 */
export const ADMIN_ROUTES = {
  login: '/login',
  users: '/usuarios',
  user: (id: string) => `/usuarios/${id}`,
  promoters: '/promotores',
  promoter: (id: string) => `/promotores/${id}`,
} as const;
