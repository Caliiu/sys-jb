import type { PrismaClient } from '@sysjb/database';

/** Jogo do catálogo do provedor, já conferido (formatos iguais aos CHECKs de casino_games). */
export interface CatalogGame {
  provider: string;
  gameCode: string;
  name: string;
  imageUrl: string | null;
  original: boolean;
}

const PROVIDER = /^[A-Za-z0-9][A-Za-z0-9 ._()&-]{0,59}$/;
const GAME_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const IMAGE = /^https:\/\/[^\s"'<>]+$/;

/** Texto curto e imprimível (o nome aparece na tela). */
const cleanName = (value: unknown) =>
  typeof value === 'string'
    ? value
        .replace(/[^\p{L}\p{N}\p{P}\p{S}\p{Zs}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120)
        .trim()
    : '';

/**
 * Lista de jogos do PlayFivers (GET /api/v2/games: `{ status, data: [{ name, image_url, status, original, game_code,
 * provider: { name } }] }`) -> jogos ativos válidos, sem repetição. Item fora do formato é descartado sozinho.
 */
export function normalizeCatalog(body: unknown): CatalogGame[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const games = new Map<string, CatalogGame>();
  for (const raw of data as Array<Record<string, unknown>>) {
    if (typeof raw !== 'object' || raw === null || raw.status === false || raw.status === 0) continue;
    const provider =
      typeof (raw.provider as { name?: unknown } | null)?.name === 'string'
        ? (raw.provider as { name: string }).name.trim()
        : '';
    const gameCode = typeof raw.game_code === 'number' ? String(raw.game_code) : String(raw.game_code ?? '').trim();
    const name = cleanName(raw.name);
    if (!PROVIDER.test(provider) || !GAME_CODE.test(gameCode) || !name) continue;
    const image = typeof raw.image_url === 'string' ? raw.image_url.trim() : '';
    games.set(`${provider}\u0000${gameCode}`, {
      provider,
      gameCode,
      name,
      imageUrl: IMAGE.test(image) && image.length <= 500 ? image : null,
      original: raw.original === true || raw.original === 1,
    });
  }
  return [...games.values()];
}

/**
 * Grava o catálogo: inclui os novos, atualiza os existentes e desativa os que saíram (nunca apaga: as rodadas
 * guardam provedor e código). Lista vazia não desativa nada (falha do provedor não tira o cassino do ar).
 * Devolve quantos ficaram ativos e quantos foram desativados.
 */
export async function storeCatalog(
  db: Pick<PrismaClient, '$transaction'>,
  games: readonly CatalogGame[],
): Promise<{ active: number; deactivated: number }> {
  if (games.length === 0) return { active: 0, deactivated: 0 };
  return db.$transaction(async (tx) => {
    const clock = await tx.$queryRaw<Array<{ started: Date }>>`SELECT clock_timestamp() AS started`;
    const started = clock[0]!.started;
    await tx.$executeRaw`
      INSERT INTO "casino_games" ("provider", "game_code", "name", "image_url", "original", "active", "synced_at")
      SELECT p, c, n, i, o, true, ${started}
      FROM unnest(${games.map((g) => g.provider)}::text[], ${games.map((g) => g.gameCode)}::text[],
                  ${games.map((g) => g.name)}::text[], ${games.map((g) => g.imageUrl)}::text[],
                  ${games.map((g) => g.original)}::boolean[]) AS t(p, c, n, i, o)
      ON CONFLICT ("provider", "game_code") DO UPDATE SET
        "name" = EXCLUDED."name", "image_url" = EXCLUDED."image_url", "original" = EXCLUDED."original",
        "active" = true, "synced_at" = EXCLUDED."synced_at"`;
    const deactivated = await tx.$executeRaw`
      UPDATE "casino_games" SET "active" = false WHERE "active" AND "synced_at" < ${started}`;
    return { active: games.length, deactivated };
  });
}

/** Provedor do PlayFivers e a carteira dele (GET /api/v2/providers: `{ data: [{ name, wallet: { name }, status }] }`). */
export interface CatalogProvider {
  name: string;
  wallet: string;
}

/** Provedores ativos com nome e carteira; item fora do formato é descartado. */
export function normalizeProviders(body: unknown): CatalogProvider[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: CatalogProvider[] = [];
  for (const raw of data as Array<Record<string, unknown>>) {
    if (typeof raw !== 'object' || raw === null || raw.status === 0 || raw.status === false) continue;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const wallet = (raw.wallet as { name?: unknown } | null)?.name;
    if (!PROVIDER.test(name) || typeof wallet !== 'string' || !wallet.trim() || wallet.length > 120) continue;
    out.push({ name, wallet: wallet.replace(/\s+/g, ' ').trim() });
  }
  return out;
}

/**
 * Só os jogos dos provedores das carteiras escolhidas (`walletKeys`, já normalizadas por walletKey). O provedor é
 * comparado sem diferença de maiúsculas. Devolve também os nomes das carteiras que existem (para o log).
 */
export function filterByWallets(
  games: readonly CatalogGame[],
  providers: readonly CatalogProvider[],
  walletKeys: readonly string[],
  walletKey: (name: string) => string,
): { games: CatalogGame[]; wallets: string[] } {
  const allowed = new Set(walletKeys);
  const providerNames = new Set(
    providers.filter((p) => allowed.has(walletKey(p.wallet))).map((p) => p.name.toLowerCase()),
  );
  return {
    games: games.filter((g) => providerNames.has(g.provider.toLowerCase())),
    wallets: [...new Set(providers.map((p) => p.wallet))].sort(),
  };
}
