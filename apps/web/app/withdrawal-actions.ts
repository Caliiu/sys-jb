'use server';

import type { PublicWallet, WithdrawalResult as ApiWithdrawalResult } from '@sysjb/contracts';
import { apiRequest } from '@/lib/api-client';
import { resolveRequest } from '@/lib/request-context';
import { readSessionToken } from '@/lib/session';
import {
  parseWithdrawalRequest,
  toWithdrawalItem,
  type WithdrawalItem,
  withdrawalKeyTypeForApi,
} from '@/lib/withdrawal';

export type WithdrawalResult =
  | { ok: true; withdrawal: WithdrawalItem; wallet: PublicWallet }
  | { ok: false; code: 'SESSION_INVALID' | 'INVALID_REQUEST' | 'UNAVAILABLE'; message: string };

const sessionEnded = { ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada. Entre novamente.' } as const;
const unavailable = {
  ok: false,
  code: 'UNAVAILABLE',
  message: 'Saque indisponível no momento. Tente novamente mais tarde.',
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resposta da API -> resultado da tela: 401 encerra a sessão; recusa (4xx) traz a mensagem dela; o resto, indisponível. */
function fromApi(res: Awaited<ReturnType<typeof apiRequest<ApiWithdrawalResult>>>): WithdrawalResult {
  if (res.ok) return { ok: true, withdrawal: toWithdrawalItem(res.data.withdrawal), wallet: res.data.wallet };
  if (res.status === 401) return sessionEnded;
  if (res.status >= 400 && res.status < 500) return { ok: false, code: 'INVALID_REQUEST', message: res.error.message };
  return unavailable;
}

/**
 * Solicita um saque. Server action = endpoint público: exige sessão válida e revalida a chave (CPF sempre o do titular)
 * e o valor contra o saldo de agora antes de chamar a API, que confere tudo de novo (limites da banca, saldo, chave)
 * e reserva o valor de forma atômica. A chave de idempotência vem da tela (uma por confirmação): clique duplo ou
 * reenvio devolvem o mesmo saque.
 */
export async function requestWithdrawalAction(input: unknown): Promise<WithdrawalResult> {
  const ctx = await resolveRequest();
  if (!ctx.ok || !ctx.me) return sessionEnded;

  const parsed = parseWithdrawalRequest(input, ctx.me.document, ctx.me.wallet.withdrawable);
  if (!parsed.ok) return { ok: false, code: 'INVALID_REQUEST', message: parsed.message };
  const sessionToken = await readSessionToken();
  if (!sessionToken) return sessionEnded;

  const { request } = parsed;
  const res = await apiRequest<ApiWithdrawalResult>(
    ctx.hostname,
    'POST',
    '/v1/payments/withdrawals',
    {
      amountCents: request.amountCents,
      keyType: withdrawalKeyTypeForApi(request.keyType),
      keyValue: request.keyValue,
      idempotencyKey: request.idempotencyKey,
    },
    { sessionToken },
  );
  return fromApi(res);
}

/** Cancela o próprio saque em análise (o valor volta para os prêmios). */
export async function cancelWithdrawalAction(withdrawalId: unknown): Promise<WithdrawalResult> {
  if (typeof withdrawalId !== 'string' || !UUID.test(withdrawalId)) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'Saque inválido.' };
  }
  const ctx = await resolveRequest();
  if (!ctx.ok || !ctx.me) return sessionEnded;
  const sessionToken = await readSessionToken();
  if (!sessionToken) return sessionEnded;
  const res = await apiRequest<ApiWithdrawalResult>(
    ctx.hostname,
    'POST',
    `/v1/payments/withdrawals/${withdrawalId}/cancel`,
    {},
    { sessionToken },
  );
  return fromApi(res);
}
