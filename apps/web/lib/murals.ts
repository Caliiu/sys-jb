import 'server-only';
import type { PublicMural } from '@sysjb/contracts';
import { apiRequest } from './api-client';
import { readSessionToken } from './session';

/**
 * Murais que o jogador logado deve ver agora (vigência de hoje; "Apenas uma vez" só se ainda não viu), lidos
 * no servidor junto com o Dashboard. Sem resposta da API, nenhum mural: o Dashboard abre do mesmo jeito.
 */
export async function loadMurals(hostname: string): Promise<PublicMural[]> {
  const sessionToken = await readSessionToken();
  if (!sessionToken) return [];
  const res = await apiRequest<PublicMural[]>(hostname, 'GET', '/v1/murals', undefined, { sessionToken });
  return res.ok ? res.data : [];
}
