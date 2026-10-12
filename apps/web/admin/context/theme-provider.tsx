'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { removeCookie, setCookie } from '@/admin/lib/cookies';
import {
  DARK_QUERY,
  DEFAULT_THEME,
  type ResolvedTheme,
  type Theme,
  THEME_COOKIE_MAX_AGE,
  THEME_COOKIE_NAME,
  resolveTheme,
} from '@/admin/lib/theme';

type ThemeProviderProps = {
  children: React.ReactNode;
  /** Tema do cookie, lido no servidor: servidor e cliente começam iguais. */
  initialTheme?: Theme;
};

type ThemeProviderState = {
  defaultTheme: Theme;
  resolvedTheme: ResolvedTheme;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resetTheme: () => void;
};

const ThemeContext = createContext<ThemeProviderState | null>(null);

/** O sistema está no escuro? No servidor (e na hidratação), não. */
function useSystemDark() {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(DARK_QUERY);
      mql.addEventListener('change', callback);
      return () => mql.removeEventListener('change', callback);
    },
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

export function ThemeProvider({ children, initialTheme = DEFAULT_THEME }: ThemeProviderProps) {
  const [theme, _setTheme] = useState<Theme>(initialTheme);
  const systemDark = useSystemDark();
  const resolvedTheme = resolveTheme(theme, systemDark);

  // Antes da pintura: o script inline já aplicou no carregamento; aqui vale para as trocas e para o remount do
  // Strict Mode (que limpa a classe do <html>). Ao sair do painel, tira o escuro.
  useLayoutEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    return () => root.classList.remove('dark');
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setCookie(THEME_COOKIE_NAME, next, THEME_COOKIE_MAX_AGE);
    _setTheme(next);
  }, []);

  const resetTheme = useCallback(() => {
    removeCookie(THEME_COOKIE_NAME);
    _setTheme(DEFAULT_THEME);
  }, []);

  const contextValue = useMemo(
    () => ({
      defaultTheme: DEFAULT_THEME,
      resolvedTheme,
      resetTheme,
      theme,
      setTheme,
    }),
    [resolvedTheme, resetTheme, theme, setTheme],
  );

  return <ThemeContext value={contextValue}>{children}</ThemeContext>;
}

export const useTheme = () => {
  const context = useContext(ThemeContext);

  if (!context) throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
