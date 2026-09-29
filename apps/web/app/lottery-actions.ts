'use server';

import { type ApiErrorCode, MAX_PULE_NUMBER, type PlaceLotteryTicketsResponse } from '@sysjb/contracts';
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
  TOO_MANY_ATTEMPTS: 'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.',
  VALIDATION_ERROR: 'Confira as apostas: há algum dado inválido.',
};

const repeatSchema = z.strictObject({
  idempotencyKey: z.uuid(),
  puleNumber: z.number().int().min(1).max(MAX_PULE_NUMBER),
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  draws: purchaseSchema.shape.draws,
});

const sessionEnded: PlaceLotteryResult = {
  ok: false,
  code: 'SESSION_INVALID',
  message: 'Sessão encerrada. Entre novamente.',
};

/** Banca (hostname) e sessão (cookie HttpOnly) da requisição; null = sem sessão utilizável. */
async function caller(): Promise<{ hostname: string; sessionToken: string } | null> {
  const hostname = hostnameOnly((await headers()).get('host'));
  const sessionToken = await readSessionToken();
  return hostname && serviceKeyFor(hostname) && sessionToken ? { hostname, sessionToken } : null;
}

/** Envia a compra à API e traduz a falha para a tela. `extra`: mensagens próprias da operação. */
async function send(
  path: string,
  body: unknown,
  extra: Partial<Record<ApiErrorCode, string>> = {},
): Promise<PlaceLotteryResult> {
  const session = await caller();
  if (!session) return sessionEnded;
  const res = await apiRequest<PlaceLotteryTicketsResponse>(session.hostname, 'POST', path, body, {
    sessionToken: session.sessionToken,
  });
  if (res.ok) return { ok: true, data: res.data };
  const { code } = res.error;
  return {
    ok: false,
    code,
    message:
      extra[code] ??
      MESSAGES[code] ??
      // Conflitos têm mensagem própria da API, pronta para a tela e sem dados pessoais.
      (code === 'CONFLICT' ? res.error.message : undefined) ??
      (res.status >= 500 ? 'Serviço indisponível. Tente novamente.' : 'Não foi possível concluir a aposta.'),
  };
}

export async function placeLotteryTicketsAction(input: unknown): Promise<PlaceLotteryResult> {
  const body = purchaseSchema.safeParse(input);
  if (!body.success) return { ok: false, code: 'VALIDATION_ERROR', message: 'Aposta inválida.' };
  return send('/v1/lotteries/tickets', body.data);
}

/**
 * Repetir pule: as apostas vêm da pule (a API só aceita pule do próprio jogador); aqui vão o número, a data e as
 * loterias escolhidas.
 */
export async function repeatLotteryTicketAction(input: unknown): Promise<PlaceLotteryResult> {
  const body = repeatSchema.safeParse(input);
  if (!body.success) return { ok: false, code: 'VALIDATION_ERROR', message: 'Pule inválida' };
  return send('/v1/lotteries/tickets/repeat', body.data, {
    NOT_FOUND: 'Pule inválida',
    VALIDATION_ERROR: 'Confira a data e as loterias escolhidas.',
  });
}
