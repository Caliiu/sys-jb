'use client';

import { useCallback, useMemo } from 'react';
import { parseRecentKeys, type RecentPixKey, recentKeysStorageKey, rememberKey } from '@/lib/recent-pix-keys';
import { useLocalStorageItem } from './useLocalStorageItem';

const NO_KEYS: RecentPixKey[] = [];

export interface UseRecentPixKeysResult {
  /** Chaves recentes do usuário (vazio no servidor e enquanto não há nenhuma). */
  recent: RecentPixKey[];
  remember: (entry: RecentPixKey) => void;
  clear: () => void;
}

/** Chaves Pix recentes guardadas neste navegador, por usuário. */
export function useRecentPixKeys(userId: string, holderDocument: string): UseRecentPixKeysResult {
  const { raw, read, write } = useLocalStorageItem(recentKeysStorageKey(userId));
  // A lista é derivada do texto guardado uma vez por mudança.
  const recent = useMemo(() => (raw ? parseRecentKeys(raw, holderDocument) : NO_KEYS), [raw, holderDocument]);

  const remember = useCallback(
    (entry: RecentPixKey) => write(JSON.stringify(rememberKey(parseRecentKeys(read(), holderDocument), entry))),
    [write, read, holderDocument],
  );
  const clear = useCallback(() => write(null), [write]);

  return { recent, remember, clear };
}
