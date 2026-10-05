'use server';

import { CASINO_LIMITS, type CasinoGamesPage } from '@sysjb/contracts';
import { type CasinoGamesFilter, loadCasinoGames } from '@/lib/casino';
import { resolveRequest } from '@/lib/request-context';

export type CasinoGamesResult =
  | { ok: true; page: CasinoGamesPage }
  | { ok: false; code: 'SESSION_INVALID' | 'INVALID_FILTER' | 'UNAVAILABLE'; message: string };

const PROVIDER = /^[A-Za-z0-9][A-Za-z0-9 ._()&-]{0,59}$/;

/** Confere o filtro vindo do navegador (server action = endpoint público). */
function parseFilter(raw: unknown): CasinoGamesFilter | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { provider, search, page } = raw as Record<string, unknown>;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > 1000) return null;
  const filter: CasinoGamesFilter = { page };
  if (provider !== undefined) {
    if (typeof provider !== 'string' || !PROVIDER.test(provider)) return null;
    filter.provider = provider;
  }
  if (search !== undefined) {
    if (typeof search !== 'string') return null;
    const text = search.trim();
    if (text.length < CASINO_LIMITS.searchMin || text.length > CASINO_LIMITS.searchMax) return null;
    filter.search = text;
  }
  return filter.provider || filter.search ? filter : null;
}

/** Cassino: "Ver todos" de um provedor e a busca, paginados. Exige sessão. */
export async function loadCasinoGamesAction(raw: unknown): Promise<CasinoGamesResult> {
  const ctx = await resolveRequest();
  if (!ctx.ok || !ctx.me) return { ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada. Entre novamente.' };
  const filter = parseFilter(raw);
  if (!filter) return { ok: false, code: 'INVALID_FILTER', message: 'Busca inválida.' };
  const page = await loadCasinoGames(ctx.hostname, filter);
  if (!page) return { ok: false, code: 'UNAVAILABLE', message: 'Não foi possível carregar os jogos. Tente novamente.' };
  return { ok: true, page };
}
