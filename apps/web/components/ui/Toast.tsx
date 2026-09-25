'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const DURATION_MS = 2500;

interface ToastApi {
  show: (message: string) => void;
  /** Atalho para funcionalidades ainda não disponíveis. */
  comingSoon: (feature?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Mensagens curtas e não bloqueantes, anunciadas a leitores de tela (aria-live). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), DURATION_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      comingSoon: (feature) => show(feature ? `${feature}: disponível em breve.` : 'Disponível em breve.'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] mx-auto flex max-w-[480px] justify-center px-4"
      >
        {message && (
          <p className="rounded-full bg-gray-900/90 px-4 py-2 text-[13px] font-medium text-white shadow-card">
            {message}
          </p>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast fora de <ToastProvider>');
  return api;
}
