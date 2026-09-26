'use server';

import { resolveRequest } from '@/lib/request-context';
import { parseWithdrawalRequest, type WithdrawalItem, withdrawalSummary } from '@/lib/withdrawal';

export type WithdrawalResult =
  | { ok: true; withdrawal: WithdrawalItem }
  | { ok: false; code: 'SESSION_INVALID' | 'INVALID_REQUEST' | 'UNAVAILABLE'; message: string };

/**
 * Solicita um saque. Server action = endpoint público: exige sessão válida e revalida TUDO no servidor
 * (chave, e o valor contra o saldo de agora, lido da API), sem confiar no que a tela calculou.
 *
 * Ponto de integração: o backend ainda não tem solicitação de saque. Quando existir, a chamada à API
 * (com reserva atômica do saldo e chave de idempotência contra clique duplo) entra no lugar do retorno
 * "UNAVAILABLE" abaixo, e devolve o saque criado.
 */
export async function requestWithdrawalAction(input: unknown): Promise<WithdrawalResult> {
  const ctx = await resolveRequest();
  if (!ctx.ok || !ctx.me) {
    return { ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada. Entre novamente.' };
  }

  const parsed = parseWithdrawalRequest(input, ctx.me.document, withdrawalSummary(ctx.me.wallet).available);
  if (!parsed.ok) return { ok: false, code: 'INVALID_REQUEST', message: parsed.message };

  return { ok: false, code: 'UNAVAILABLE', message: 'Saque indisponível no momento. Tente novamente mais tarde.' };
}
