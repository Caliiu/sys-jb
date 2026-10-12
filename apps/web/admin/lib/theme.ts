// Tema do painel compartilhado entre servidor e cliente (sem 'use client': o layout do servidor lê o cookie e injeta
// o script; o ThemeProvider usa as mesmas constantes).

export type Theme = 'dark' | 'light' | 'system';
export type ResolvedTheme = Exclude<Theme, 'system'>;

export const DEFAULT_THEME: Theme = 'light';
/** Cookie do tema (só existe no host do painel). */
export const THEME_COOKIE_NAME = 'admin_theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 ano
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export const parseTheme = (value: string | undefined | null): Theme =>
  value === 'dark' || value === 'light' || value === 'system' ? value : DEFAULT_THEME;

export const resolveTheme = (theme: Theme, systemDark: boolean): ResolvedTheme =>
  theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

/**
 * Roda no meio do HTML, antes da primeira pintura: põe .dark no <html> conforme o cookie (e o sistema, em
 * "Sistema"). Sem ele, quem usa o escuro veria o painel claro piscar até a hidratação.
 */
export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE_NAME}=([^;]*)/);var t=m?decodeURIComponent(m[1]):"${DEFAULT_THEME}";var d=t==="dark"||(t==="system"&&matchMedia("${DARK_QUERY}").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
