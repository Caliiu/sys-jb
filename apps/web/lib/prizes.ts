import 'server-only';
import type { PrizeClaim, PrizesReport } from '@sysjb/contracts';
import { apiRequest } from './api-client';
import { readSessionToken } from './session';

/**
 * Pules premiadas do jogador logado na data (YYYY-MM-DD, já conferida pela página), lidas no servidor.
 * null = não foi possível consultar: a tela avisa em vez de dizer que nada foi premiado.
 */
export async function loadPrizes(hostname: string, date: string): Promise<PrizesReport | null> {
  const sessionToken = await readSessionToken();
  if (!sessionToken) return null;
  const res = await apiRequest<PrizesReport>(
    hostname,
    'GET',
    `/v1/me/prizes?date=${encodeURIComponent(date)}`,
    undefined,
    { sessionToken },
  );
  return res.ok ? res.data : null;
}

/**
 * Reclame: situação do prêmio da pule (código já normalizado pela página) do jogador logado. null = não foi
 * possível consultar.
 */
export async function loadPrizeClaim(hostname: string, puleCode: string): Promise<PrizeClaim | null> {
  const sessionToken = await readSessionToken();
  if (!sessionToken) return null;
  const res = await apiRequest<PrizeClaim>(
    hostname,
    'GET',
    `/v1/me/prizes/claim?pule=${encodeURIComponent(puleCode)}`,
    undefined,
    { sessionToken },
  );
  return res.ok ? res.data : null;
}
