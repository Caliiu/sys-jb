'use server';

import { MAX_PULE_NUMBER, type PuleDetail } from '@sysjb/contracts';
import { apiRequest } from '@/lib/api-client';
import { resolveRequest } from '@/lib/request-context';
import { readSessionToken } from '@/lib/session';

export type CancelPuleResult =
  | { ok: true; detail: PuleDetail }
  | { ok: false; code: 'SESSION_INVALID' | 'INVALID_REQUEST' | 'REFUSED' | 'UNAVAILABLE'; message: string };

const sessionEnded = { ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada. Entre novamente.' } as const;

/**
 * Cancela uma pule de Loterias do jogador logado (nos primeiros minutos depois da aposta e antes do horário de venda).
 * Server action = endpoint público: o número é conferido aqui e a API confere dono, prazo e situação de novo; o banco
 * devolve o valor às mesmas bolsas numa transação.
 */
export async function cancelPuleAction(puleNumber: unknown): Promise<CancelPuleResult> {
  if (typeof puleNumber !== 'number' || !Number.isSafeInteger(puleNumber) || puleNumber < 1) {
    return { ok: false, code: 'INVALID_REQUEST', message: 'Pule inválida.' };
  }
  if (puleNumber > MAX_PULE_NUMBER) return { ok: false, code: 'INVALID_REQUEST', message: 'Pule inválida.' };
  const ctx = await resolveRequest();
  if (!ctx.ok || !ctx.me) return sessionEnded;
  const sessionToken = await readSessionToken();
  if (!sessionToken) return sessionEnded;

  const res = await apiRequest<PuleDetail>(
    ctx.hostname,
    'POST',
    `/v1/me/pules/${puleNumber}/cancel`,
    {},
    {
      sessionToken,
    },
  );
  if (res.ok) return { ok: true, detail: res.data };
  if (res.error.code === 'SESSION_INVALID') return sessionEnded;
  // Prazo encerrado, venda fechada ou já cancelada: a mensagem da API explica.
  if (res.status === 409) return { ok: false, code: 'REFUSED', message: res.error.message };
  if (res.status === 404) return { ok: false, code: 'INVALID_REQUEST', message: 'Pule não encontrada.' };
  return { ok: false, code: 'UNAVAILABLE', message: 'Não foi possível cancelar agora. Tente novamente.' };
}
