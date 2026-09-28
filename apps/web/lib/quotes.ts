import 'server-only';
import type { PublicQuotes } from '@sysjb/contracts';
import { apiRequest } from './api-client';
import { readSessionToken } from './session';

/**
 * Cotações da banca para o jogador logado (lidas no servidor, junto com a página). null = não foi
 * possível consultar: a tela avisa em vez de mostrar prêmios que podem não valer.
 */
export async function loadQuotes(hostname: string): Promise<PublicQuotes | null> {
  const sessionToken = await readSessionToken();
  if (!sessionToken) return null;
  const res = await apiRequest<PublicQuotes>(hostname, 'GET', '/v1/quotes', undefined, { sessionToken });
  return res.ok ? res.data : null;
}
