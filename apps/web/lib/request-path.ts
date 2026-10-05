/** Cabeçalho (só da requisição interna, posto pelo proxy.ts) com o caminho pedido, antes do rewrite do painel. */
export const REQUEST_PATH_HEADER = 'x-sysjb-path';

/** Entrada do app ou do painel (/): sem sessão, vai ao login em vez de mostrar 401. */
export const isEntryPath = (path: string | null) => path === null || path === '' || path === '/';
