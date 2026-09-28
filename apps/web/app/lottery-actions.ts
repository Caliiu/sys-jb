'use server';

import type { ApiErrorCode, PlaceLotteryTicketsResponse } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { hostnameOnly, serviceKeyFor } from '@/lib/server-env';
import { readSessionToken } from '@/lib/session';

/**
 * Compra de loterias. Server action = endpoint público: confere só o formato e usa a sessão do cookie
 * HttpOnly. Catálogo, horário, cotação, saldo e palpites são decididos pela API.
 */

export type PlaceLotteryResult =
  { ok: true; data: PlaceLotteryTicketsResponse } | { ok: false; code: ApiErrorCode; message: string };

const purchaseSchema = z.strictObject({
  idempotencyKey: z.uuid(),
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  draws: z
    .array(z.strictObject({ name: z.string().min(1).max(40), hour: z.number().int() }))
    .min(1)
    .max(20),
  items: z
    .array(
      z.strictObject({
        modality: z.string().min(1).max(40),
        placement: z.string().min(1).max(20),
        guesses: z
          .array(z.string().regex(/^\d{1,20}$/))
          .min(1)
          .max(100),
        amountCents: z.number().int().positive(),
        split: z.enum(['total', 'each']),
        quoteCents: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(20),
});

const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  INSUFFICIENT_FUNDS: 'Saldo indisponível',
  DRAW_CLOSED: 'Uma das loterias escolhidas já encerrou. Escolha outra.',
  QUOTE_CHANGED: 'A cotação mudou. Confira os prêmios antes de apostar.',
  SESSION_INVALID: 'Sessão encerrada. Entre novamente.',
  VALIDATION_ERROR: 'Confira as apostas: há algum dado inválido.',
};

export async function placeLotteryTicketsAction(input: unknown): Promise<PlaceLotteryResult> {
  const body = purchaseSchema.safeParse(input);
  if (!body.success) return { ok: false, code: 'VALIDATION_ERROR', message: 'Aposta inválida.' };
  const hostname = hostnameOnly((await headers()).get('host'));
  const sessionToken = await readSessionToken();
  if (!hostname || !serviceKeyFor(hostname) || !sessionToken) {
    return { ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada. Entre novamente.' };
  }

  const res = await apiRequest<PlaceLotteryTicketsResponse>(hostname, 'POST', '/v1/lotteries/tickets', body.data, {
    sessionToken,
  });
  if (res.ok) return { ok: true, data: res.data };
  const { code } = res.error;
  return {
    ok: false,
    code,
    message:
      MESSAGES[code] ??
      (res.status >= 500 ? 'Serviço indisponível. Tente novamente.' : 'Não foi possível concluir a aposta.'),
  };
}
