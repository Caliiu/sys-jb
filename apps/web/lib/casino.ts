import 'server-only';
import type { CasinoGamesPage, CasinoLaunchResponse, CasinoLobby } from '@sysjb/contracts';
import { apiRequest } from './api-client';
import { readSessionToken } from './session';

/** Lobby do cassino do jogador logado, lido no servidor. null = não foi possível consultar (a tela avisa). */
export async function loadCasinoLobby(hostname: string): Promise<CasinoLobby | null> {
  const sessionToken = await readSessionToken();
  if (!sessionToken) return null;
  const res = await apiRequest<CasinoLobby>(hostname, 'GET', '/v1/casino/lobby', undefined, { sessionToken });
  return res.ok ? res.data : null;
}

export interface CasinoGamesFilter {
  provider?: string;
  search?: string;
  page: number;
}

/** "Ver todos" de um provedor ou a busca (filtro já conferido por quem chama). null = falhou. */
export async function loadCasinoGames(hostname: string, filter: CasinoGamesFilter): Promise<CasinoGamesPage | null> {
  const sessionToken = await readSessionToken();
  if (!sessionToken) return null;
  const query = new URLSearchParams({ page: String(filter.page) });
  if (filter.provider) query.set('provider', filter.provider);
  if (filter.search) query.set('search', filter.search);
  const res = await apiRequest<CasinoGamesPage>(hostname, 'GET', `/v1/casino/games?${query}`, undefined, {
    sessionToken,
  });
  return res.ok ? res.data : null;
}

export type CasinoLaunchResult =
  { ok: true; launch: CasinoLaunchResponse } | { ok: false; reason: 'SESSION' | 'NOT_FOUND' | 'UNAVAILABLE' };

/** Abre o jogo (id já conferido) para o jogador logado: o endereço do provedor vem da API. */
export async function launchCasinoGame(hostname: string, gameId: number): Promise<CasinoLaunchResult> {
  const sessionToken = await readSessionToken();
  if (!sessionToken) return { ok: false, reason: 'SESSION' };
  const res = await apiRequest<CasinoLaunchResponse>(
    hostname,
    'POST',
    `/v1/casino/games/${gameId}/launch`,
    {},
    {
      sessionToken,
    },
  );
  if (res.ok) return { ok: true, launch: res.data };
  if (res.status === 401) return { ok: false, reason: 'SESSION' };
  if (res.status === 404) return { ok: false, reason: 'NOT_FOUND' };
  return { ok: false, reason: 'UNAVAILABLE' };
}

/** Id da tela do jogo (/cassino/jogo/[id]): só inteiro positivo, sem zeros à esquerda. */
export function parseCasinoGameId(raw: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id <= 2_147_483_647 ? id : null;
}
