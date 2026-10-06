'use server';

import type { PublicDeposit, PublicDepositStatus, PublicWallet } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { DEPOSIT_DESTINATION, PIX_CHARGE_SECONDS, parseChargeRequest, type PixCharge } from '@/lib/recharge';
import { readSessionToken } from '@/lib/session';
import { hostnameOnly, serviceKeyFor } from '@/lib/server-env';

export type ChargeResult =
  | { ok: true; charge: PixCharge }
  | {
      ok: false;
      code: 'SESSION_INVALID' | 'INVALID_REQUEST' | 'UNAVAILABLE' | 'TOO_MANY_ATTEMPTS';
      message: string;
    };

export type DepositStatusResult =
  | { ok: true; status: PublicDeposit['status']; wallet: PublicWallet | null }
  | { ok: false; code: 'SESSION_INVALID' | 'UNAVAILABLE' };

const sessionEnded = { ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada. Entre novamente.' } as const;
const unavailable = {
  ok: false,
  code: 'UNAVAILABLE',
  message: 'Pix indisponível no momento. Tente novamente mais tarde.',
} as const;

/** Banca (hostname) e sessão (cookie HttpOnly) da requisição; null = sem sessão utilizável. */
async function caller(): Promise<{ hostname: string; sessionToken: string } | null> {
  const hostname = hostnameOnly((await headers()).get('host'));
  const sessionToken = await readSessionToken();
  return hostname && serviceKeyFor(hostname) && sessionToken ? { hostname, sessionToken } : null;
}

const toCharge = (deposit: PublicDeposit): PixCharge => ({
  depositId: deposit.id,
  code: deposit.pixCode,
  amountCents: deposit.amountCents,
  expiresAt: deposit.expiresAt,
  durationSeconds: PIX_CHARGE_SECONDS,
});

/**
 * Gera a cobrança Pix da recarga no gateway ativo da banca. Server action = endpoint público: exige sessão válida e
 * revalida o pedido aqui e na API (o formulário do navegador não é confiável).
 */
export async function createPixChargeAction(input: unknown): Promise<ChargeResult> {
  const request = parseChargeRequest(input);
  if (!request) return { ok: false, code: 'INVALID_REQUEST', message: 'Valor ou destino inválido.' };
  const session = await caller();
  if (!session) return sessionEnded;

  const res = await apiRequest<PublicDeposit>(
    session.hostname,
    'POST',
    '/v1/payments/deposits',
    { amountCents: request.amountCents, destination: DEPOSIT_DESTINATION[request.destination] },
    { sessionToken: session.sessionToken },
  );
  if (res.ok) return { ok: true, charge: toCharge(res.data) };
  if (res.error.code === 'SESSION_INVALID') return sessionEnded;
  // Limite de cobranças abertas: a mensagem da API já explica o que fazer.
  if (res.error.code === 'TOO_MANY_ATTEMPTS')
    return { ok: false, code: 'TOO_MANY_ATTEMPTS', message: res.error.message };
  if (res.error.code === 'VALIDATION_ERROR') {
    return { ok: false, code: 'INVALID_REQUEST', message: 'Valor ou destino inválido.' };
  }
  return unavailable;
}

const depositIdSchema = z.uuid();

/** Situação do depósito (a API confere no gateway); com a carteira atualizada quando já pago. */
export async function depositStatusAction(depositId: unknown): Promise<DepositStatusResult> {
  const id = depositIdSchema.safeParse(depositId);
  if (!id.success) return { ok: false, code: 'UNAVAILABLE' };
  const session = await caller();
  if (!session) return { ok: false, code: 'SESSION_INVALID' };

  const res = await apiRequest<PublicDepositStatus>(
    session.hostname,
    'GET',
    `/v1/payments/deposits/${id.data}`,
    undefined,
    { sessionToken: session.sessionToken },
  );
  if (res.ok) return { ok: true, status: res.data.deposit.status, wallet: res.data.wallet };
  return { ok: false, code: res.error.code === 'SESSION_INVALID' ? 'SESSION_INVALID' : 'UNAVAILABLE' };
}
