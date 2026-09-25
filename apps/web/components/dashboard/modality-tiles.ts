import type { CSSProperties } from 'react';
import type { GameModalityResponse } from '@/lib/modalities';

/** Lógica comum às faixas de modalidades (PrimaryTiles, GamesGrid, CassinoBanner). */

export function findModality(modalities: GameModalityResponse[], slug: string) {
  return modalities.find((m) => m.slug === slug);
}

/** Enquanto carrega, mostra todos (esqueleto); depois, só as modalidades ativas. */
export function visibleTiles<T extends { slug: string }>(
  tiles: T[],
  modalities: GameModalityResponse[],
  isLoading: boolean,
): T[] {
  return tiles.filter((tile) => isLoading || modalities.some((m) => m.slug === tile.slug));
}

export function bannerStyle(bannerUrl: string | null | undefined): CSSProperties | undefined {
  return bannerUrl
    ? { backgroundImage: `url(${JSON.stringify(bannerUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;
}

/** "LOTERIAS" -> "Loterias" (rótulos dos tiles são em caixa alta; mensagens não). */
export function titleCase(label: string): string {
  return label.charAt(0) + label.slice(1).toLowerCase();
}
