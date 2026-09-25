'use client';

import type { GameModalityResponse } from '@/lib/modalities';
import { useToast } from '../ui/Toast';
import { bannerStyle, findModality, titleCase, visibleTiles } from './modality-tiles';

interface TileConfig {
  slug: string;
  label: string;
  fontSize: string;
  gradient: string;
}

const TILES: TileConfig[] = [
  {
    slug: 'loterias',
    label: 'LOTERIAS',
    fontSize: 'text-[19px]',
    gradient: 'from-brand-primaryLight to-brand-primaryDark',
  },
  { slug: 'fazendinha', label: 'FAZENDINHA', fontSize: 'text-[17px]', gradient: 'from-brand-green to-brand-greenDark' },
];

interface PrimaryTilesProps {
  modalities: GameModalityResponse[];
  isLoading: boolean;
}

export default function PrimaryTiles({ modalities, isLoading }: PrimaryTilesProps) {
  const toast = useToast();
  const visible = visibleTiles(TILES, modalities, isLoading);
  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-1 px-4 mt-1">
      {visible.map((tile) => {
        const banner = findModality(modalities, tile.slug)?.bannerUrl;
        return (
          <button
            key={tile.slug}
            type="button"
            aria-label={banner ? tile.label : undefined}
            onClick={() => toast.comingSoon(titleCase(tile.label))}
            style={bannerStyle(banner)}
            className={`relative h-28 rounded-xl2 overflow-hidden shadow-card text-left active:scale-[0.98] transition-transform ${
              banner ? '' : `bg-gradient-to-br ${tile.gradient}`
            } ${visible.length === 1 ? 'col-span-2' : ''}`}
          >
            {!banner && (
              <span
                className={`absolute left-3 bottom-3 text-white font-display ${tile.fontSize} leading-none drop-shadow`}
              >
                {tile.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
