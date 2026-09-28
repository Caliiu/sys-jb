'use server';

import type { ApiErrorCode, FazendinhaSoldEntry, PlaceFazendinhaBetResponse } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { hostnameOnly, serviceKeyFor } from '@/lib/server-env';
import { readSessionToken } from '@/lib/session';

/**
 * Compra e consulta da Fazendinha. Server action = endpoint público: confere só o formato e usa a sessão
 * do cookie HttpOnly. Catálogo, horário, saldo e números livres são decididos pela API.
 */

export type PlaceBetResult =
  | { ok: true; data: PlaceFazendinhaBetResponse }
  | {
      ok: false;
      code: ApiErrorCode;
      message: string;
      /** NUMBERS_UNAVAILABLE: os palpites que outra pessoa comprou primeiro. */
      unavailable?: number[];
    };

const betSchema = z.strictObject({
  idempotencyKey: z.uuid(),
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lottery: z.string().min(1).max(40),
  hour: z.number().int(),
  mode: z.enum(['grupo', 'dezena', 'centena']),
  stakeCents: z.number().int().positive(),
  prizeCents: z.number().int().positive(),
  numbers: z.array(z.number().int()).min(1).max(100),
});

const drawDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function caller(): Promise<{ hostname: string; sessionToken: string } | null> {
  const hostname = hostnameOnly((await headers()).get('host'));
  if (!hostname || !serviceKeyFor(hostname)) return null;
  const sessionToken = await readSessionToken();
  return sessionToken ? { hostname, sessionToken } : null;
}

/** Compra os palpites. A mesma idempotencyKey nunca cobra duas vezes (reenvio após falha de rede). */
export async function placeFazendinhaBetAction(input: unknown): Promise<PlaceBetResult> {
  const body = betSchema.safeParse(input);
  if (!body.success) return { ok: false, code: 'VALIDATION_ERROR', message: 'Aposta inválida.' };
  const session = await caller();
  if (!session) return { ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada. Entre novamente.' };

  const res = await apiRequest<PlaceFazendinhaBetResponse>(session.hostname, 'POST', '/v1/fazendinha/bets', body.data, {
    sessionToken: session.sessionToken,
  });
  if (res.ok) return { ok: true, data: res.data };

  const { code } = res.error;
  switch (code) {
    case 'INSUFFICIENT_FUNDS':
      return { ok: false, code, message: 'Saldo indisponível' };
    case 'NUMBERS_UNAVAILABLE': {
      const listed = res.error.details?.find((d) => d.field === 'numbers')?.message ?? '';
      const unavailable = listed.split(',').filter(Boolean).map(Number).filter(Number.isInteger);
      return { ok: false, code, message: 'Alguns palpites acabaram de ser vendidos.', unavailable };
    }
    case 'QUOTE_CHANGED':
      return { ok: false, code, message: 'A cotação mudou. Confira o novo prêmio antes de apostar.' };
    case 'DRAW_CLOSED':
      return { ok: false, code, message: 'Extração encerrada. Escolha outra.' };
    case 'SESSION_INVALID':
      return { ok: false, code, message: 'Sessão encerrada. Entre novamente.' };
    default:
      return {
        ok: false,
        code,
        message: res.status >= 500 ? 'Serviço indisponível. Tente novamente.' : 'Não foi possível concluir a compra.',
      };
  }
}

/** Números já vendidos no dia (YYYY-MM-DD). null = não foi possível consultar. */
export async function fazendinhaSoldAction(drawDate: unknown): Promise<FazendinhaSoldEntry[] | null> {
  const date = drawDateSchema.safeParse(drawDate);
  if (!date.success) return null;
  const session = await caller();
  if (!session) return null;

  const res = await apiRequest<FazendinhaSoldEntry[]>(
    session.hostname,
    'GET',
    `/v1/fazendinha/sold?drawDate=${date.data}`,
    undefined,
    { sessionToken: session.sessionToken },
  );
  return res.ok ? res.data : null;
}
