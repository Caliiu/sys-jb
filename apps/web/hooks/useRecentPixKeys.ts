'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { parseRecentKeys, type RecentPixKey, recentKeysStorageKey, rememberKey } from '@/lib/recent-pix-keys';

const CHANGED_EVENT = 'sysjb:recent-pix-keys-changed';

function subscribe(onChange: () => void): () => void {
  // "storage" avisa mudanças de outras abas; o evento próprio avisa as desta (o "storage" não dispara na mesma aba).
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGED_EVENT, onChange);
  };
}

const NO_KEYS: RecentPixKey[] = [];

export interface UseRecentPixKeysResult {
  /** Chaves recentes do usuário (vazio no servidor e enquanto não há nenhuma). */
  recent: RecentPixKey[];
  remember: (entry: RecentPixKey) => void;
  clear: () => void;
}

/**
 * Chaves Pix recentes guardadas neste navegador, por usuário. Sem armazenamento disponível
 * (navegação privada, bloqueio), simplesmente não há recentes: nada quebra.
 */
export function useRecentPixKeys(userId: string, holderDocument: string): UseRecentPixKeysResult {
  const key = recentKeysStorageKey(userId);

  const getSnapshot = useCallback((): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);
  // O snapshot é o texto guardado (comparável por valor); a lista é derivada dele uma vez por mudança.
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const recent = useMemo(() => (raw ? parseRecentKeys(raw, holderDocument) : NO_KEYS), [raw, holderDocument]);

  const write = useCallback(
    (next: RecentPixKey[]) => {
      try {
        if (next.length === 0) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        return; // sem armazenamento: segue sem lembrar
      }
      window.dispatchEvent(new Event(CHANGED_EVENT));
    },
    [key],
  );

  const remember = useCallback(
    (entry: RecentPixKey) => write(rememberKey(parseRecentKeys(getSnapshot(), holderDocument), entry)),
    [write, getSnapshot, holderDocument],
  );
  const clear = useCallback(() => write([]), [write]);

  return { recent, remember, clear };
}
