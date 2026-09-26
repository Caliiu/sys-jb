/** Rotas do painel administrativo (fonte única para links, redirecionamentos e navegação). */
export const ADMIN_ROUTES = {
  login: '/admin/login',
  users: '/admin/usuarios',
  user: (id: string) => `/admin/usuarios/${id}`,
} as const;
