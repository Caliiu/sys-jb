'use client';

import { useCallback, useSyncExternalStore } from 'react';

const CHANGED_EVENT = 'sysjb:local-storage-changed';

function subscribe(onChange: () => void): () => void {
  // "storage" avisa mudanças de outras abas; o evento próprio avisa as desta (o "storage" não dispara na mesma aba).
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGED_EVENT, onChange);
  };
}

export interface LocalStorageItem {
  /** Texto guardado (null: não há nada, ou está sem armazenamento; no servidor é sempre null). */
  raw: string | null;
  /** Leitura na hora (para "ler, alterar, gravar" dentro de um evento). */
  read: () => string | null;
  /** Grava (ou apaga, com null) e avisa as telas e abas que usam a mesma chave. */
  write: (next: string | null) => void;
}

/**
 * Um item do localStorage como estado reativo, seguro para servidor e hidratação (começa null).
 * Sem armazenamento (navegação privada, bloqueio, cota cheia), nada quebra: apenas não guarda.
 */
export function useLocalStorageItem(key: string): LocalStorageItem {
  const read = useCallback((): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);
  // O snapshot é o texto guardado (comparável por valor): a tela só renderiza de novo se ele mudar.
  const raw = useSyncExternalStore(subscribe, read, () => null);

  const write = useCallback(
    (next: string | null) => {
      try {
        if (next === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, next);
      } catch {
        return; // sem armazenamento: segue sem lembrar
      }
      window.dispatchEvent(new Event(CHANGED_EVENT));
    },
    [key],
  );

  return { raw, read, write };
}
