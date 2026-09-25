'use client';

import type { PublicWallet } from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { meAction } from '@/app/auth-actions';

export interface UseWalletResult {
  wallet: PublicWallet;
  /** true quando a última tentativa de buscar a wallet falhou — nunca deve
   * ser confundido com "saldo zero", já que aqui não sabemos o saldo real. */
  error: boolean;
  refresh: () => Promise<void>;
}

/**
 * Carteira do usuário logado. O valor inicial vem do servidor junto com a página;
 * refresh() busca de novo via /v1/me. Sessão encerrada/expirada leva ao login.
 */
export function useWallet(initial: PublicWallet): UseWalletResult {
  const router = useRouter();
  const [wallet, setWallet] = useState(initial);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await meAction();
      if (res.ok) {
        setWallet(res.user.wallet);
        setError(false);
        return;
      }
      if (res.code === 'SESSION_INVALID') {
        router.replace('/login');
        return;
      }
      setError(true);
    } catch {
      setError(true);
    }
  }, [router]);

  return { wallet, error, refresh };
}
