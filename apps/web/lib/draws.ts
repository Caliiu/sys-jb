import 'server-only';
import type { DrawSchedule } from '@sysjb/contracts';
import { apiRequest } from './api-client';
import { readSessionToken } from './session';

/**
 * Sorteios da banca para o jogador logado (cadastro do painel: dias, exceções e horário de venda), lidos no
 * servidor junto com a página. null = não foi possível consultar: a tela avisa em vez de oferecer sorteios
 * que podem não valer.
 */
export async function loadDraws(hostname: string): Promise<DrawSchedule | null> {
  const sessionToken = await readSessionToken();
  if (!sessionToken) return null;
  const res = await apiRequest<DrawSchedule>(hostname, 'GET', '/v1/draws', undefined, { sessionToken });
  return res.ok ? res.data : null;
}
