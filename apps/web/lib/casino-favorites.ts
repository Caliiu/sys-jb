import type { CasinoGameCard } from '@sysjb/contracts';

/** Quantos jogos favoritos ficam guardados neste aparelho. */
export const MAX_CASINO_FAVORITES = 60;

/** Um por usuário: outro jogador no mesmo aparelho não vê os favoritos deste. */
export const casinoFavoritesKey = (userId: string) => `sysjb:casino-favorites:${userId}`;

const PROVIDER = /^[A-Za-z0-9][A-Za-z0-9 ._()&-]{0,59}$/;

/**
 * Lê os favoritos guardados. O armazenamento pode ter sido alterado à mão: só passa o que tem o formato de um jogo
 * (id inteiro, nome curto, imagem só https), sem repetir e até o máximo.
 */
export function parseCasinoFavorites(raw: string | null): CasinoGameCard[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<number>();
  const out: CasinoGameCard[] = [];
  for (const item of data as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, name, provider, imageUrl } = item as Record<string, unknown>;
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > 2_147_483_647 || seen.has(id)) continue;
    if (typeof name !== 'string' || name.length < 1 || name.length > 120) continue;
    if (typeof provider !== 'string' || !PROVIDER.test(provider)) continue;
    const image = typeof imageUrl === 'string' && /^https:\/\/[^\s"'<>]+$/.test(imageUrl) ? imageUrl : null;
    seen.add(id);
    out.push({ id, name, provider, imageUrl: image });
    if (out.length === MAX_CASINO_FAVORITES) break;
  }
  return out;
}

/** Marca (no topo) ou desmarca o jogo. */
export function toggleCasinoFavorite(list: readonly CasinoGameCard[], game: CasinoGameCard): CasinoGameCard[] {
  if (list.some((g) => g.id === game.id)) return list.filter((g) => g.id !== game.id);
  const { id, name, provider, imageUrl } = game;
  return [{ id, name, provider, imageUrl }, ...list].slice(0, MAX_CASINO_FAVORITES);
}
