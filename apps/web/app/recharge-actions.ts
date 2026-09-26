'use server';

import { createPixCharge } from '@/lib/pix-charge';
import { parseChargeRequest, type PixCharge } from '@/lib/recharge';
import { resolveRequest } from '@/lib/request-context';

export type ChargeResult =
  | { ok: true; charge: PixCharge }
  | { ok: false; code: 'SESSION_INVALID' | 'INVALID_REQUEST' | 'UNAVAILABLE'; message: string };

/**
 * Gera a cobrança Pix da recarga. Server action = endpoint público: exige sessão válida e
 * revalida o pedido no servidor (o formulário do navegador não é confiável).
 */
export async function createPixChargeAction(input: unknown): Promise<ChargeResult> {
  const ctx = await resolveRequest();
  if (!ctx.ok || !ctx.me) {
    return { ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada. Entre novamente.' };
  }

  const request = parseChargeRequest(input);
  if (!request) return { ok: false, code: 'INVALID_REQUEST', message: 'Valor ou destino inválido.' };

  const charge = await createPixCharge(request);
  if (!charge) {
    return { ok: false, code: 'UNAVAILABLE', message: 'Pix indisponível no momento. Tente novamente mais tarde.' };
  }
  return { ok: true, charge };
}
