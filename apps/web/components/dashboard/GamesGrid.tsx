'use client';

import { Ticket, Dice5, Flame } from 'lucide-react';
import type { GameModalityResponse } from '@/lib/modalities';
import { useToast } from '../ui/Toast';
import { bannerStyle, findModality, titleCase, visibleTiles } from './modality-tiles';

interface TileConfig {
  slug: string;
  label: string;
  fontSize: string;
  icon: typeof Ticket;
  gradient: string;
  badge?: boolean;
}

const TILES: TileConfig[] = [
  {
    slug: 'raspadinha',
    label: 'RASPADINHA',
    fontSize: 'text-[16px]',
    icon: Ticket,
    gradient: 'from-brand-purple to-brand-purpleDark',
    badge: true,
  },
  {
    slug: 'bingo',
    label: 'BINGO',
    fontSize: 'text-[18px]',
    icon: Dice5,
    gradient: 'from-brand-primary to-brand-primaryDark',
  },
];

interface GamesGridProps {
  modalities: GameModalityResponse[];
  isLoading: boolean;
}

export default function GamesGrid({ modalities, isLoading }: GamesGridProps) {
  const toast = useToast();
  const visible = visibleTiles(TILES, modalities, isLoading);
  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-1 px-4 mt-1">
      {visible.map((tile) => {
        const banner = findModality(modalities, tile.slug)?.bannerUrl;
        const Icon = tile.icon;
        return (
          <button
            key={tile.slug}
            type="button"
            aria-label={banner ? tile.label : undefined}
            onClick={() => toast.comingSoon(titleCase(tile.label))}
            style={bannerStyle(banner)}
            className={`relative h-28 rounded-xl2 overflow-hidden shadow-card active:scale-[0.98] transition-transform ${
              banner ? '' : `bg-gradient-to-br ${tile.gradient}`
            } ${visible.length === 1 ? 'col-span-2' : ''}`}
          >
            {tile.badge && !banner && (
              <span className="absolute top-2 right-2 flex items-center gap-1 bg-brand-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                <Flame className="w-2.5 h-2.5" aria-hidden /> EM ALTA
              </span>
            )}
            {!banner && (
              <span className="h-full flex flex-col items-center justify-center gap-1.5">
                <Icon className="w-8 h-8 text-white" aria-hidden />
                <span className={`text-white font-display ${tile.fontSize} leading-none`}>{tile.label}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
