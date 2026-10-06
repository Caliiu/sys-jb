import 'server-only';
import type { MyWithdrawals } from '@sysjb/contracts';
import { apiRequest } from './api-client';
import { readSessionToken } from './session';

/** "Meus saques" do jogador logado, os limites de hoje e o sacável, lidos no servidor. null = falhou (a tela avisa). */
export async function loadMyWithdrawals(hostname: string): Promise<MyWithdrawals | null> {
  const sessionToken = await readSessionToken();
  if (!sessionToken) return null;
  const res = await apiRequest<MyWithdrawals>(hostname, 'GET', '/v1/payments/withdrawals', undefined, { sessionToken });
  return res.ok ? res.data : null;
}
