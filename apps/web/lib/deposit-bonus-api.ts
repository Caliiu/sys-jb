import 'server-only';
import type { PublicDepositBonusOffers } from '@sysjb/contracts';
import { apiRequest } from './api-client';
import { readSessionToken } from './session';

/**
 * Bônus de recarga que vale agora para o jogador logado, lido no servidor. null = falhou: a tela de recarga segue
 * normal, só sem o aviso (o bônus é concedido pelo banco de qualquer forma).
 */
export async function loadDepositBonusOffers(hostname: string): Promise<PublicDepositBonusOffers | null> {
  const sessionToken = await readSessionToken();
  if (!sessionToken) return null;
  const res = await apiRequest<PublicDepositBonusOffers>(hostname, 'GET', '/v1/payments/deposit-bonus', undefined, {
    sessionToken,
  });
  return res.ok ? res.data : null;
}
