'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { HomeLayoutCard } from '@sysjb/contracts';
import type { GameModalityResponse } from '@/lib/modalities';
import { ROUTES } from '@/lib/routes';
import { useToast } from '../ui/Toast';
import { arrangeCards, bannerStyle, findModality, titleCase, visibleTiles } from './modality-tiles';

interface TileConfig {
  slug: string;
  label: string;
  fontSize: string;
  gradient: string;
  /** Sem rota, o tile avisa que a modalidade vem em breve. */
  href?: string;
  /** Ilustração (PNG/WebP transparente) sobre o degradê, centralizada e inteira. */
  image?: { src: string; width: number; height: number };
}

const TILES: TileConfig[] = [
  {
    slug: 'loterias',
    label: 'LOTERIAS',
    fontSize: 'text-[19px]',
    gradient: 'from-brand-primaryLight to-brand-primaryDark',
    href: ROUTES.lotteries,
    image: { src: '/tiles/loterias.webp', width: 640, height: 538 },
  },
  {
    slug: 'fazendinha',
    label: 'FAZENDINHA',
    fontSize: 'text-[17px]',
    gradient: 'from-brand-green to-brand-greenDark',
    href: ROUTES.fazendinha,
    image: { src: '/tiles/fazendinha.webp', width: 640, height: 425 },
  },
];

interface PrimaryTilesProps {
  modalities: GameModalityResponse[];
  isLoading: boolean;
  /** Ordem e visibilidade dos cards (Loterias, Fazendinha) definidas pelo Gerente. */
  cards?: HomeLayoutCard[];
}

export default function PrimaryTiles({ modalities, isLoading, cards }: PrimaryTilesProps) {
  const toast = useToast();
  const visible = arrangeCards(visibleTiles(TILES, modalities, isLoading), (tile) => tile.slug, cards);
  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-1 px-4 mt-1">
      {visible.map((tile) => {
        const banner = findModality(modalities, tile.slug)?.bannerUrl;
        const className = `relative block h-28 rounded-xl2 overflow-hidden shadow-card text-left active:scale-[0.98] transition-transform ${
          banner ? '' : `bg-gradient-to-br ${tile.gradient}`
        } ${visible.length === 1 ? 'col-span-2' : ''}`;
        // Banner da modalidade (cadastrado) substitui o card desenhado.
        const content = !banner && (
          <>
            {tile.image && (
              <Image
                src={tile.image.src}
                alt=""
                width={tile.image.width}
                height={tile.image.height}
                sizes="180px"
                priority
                className="absolute bottom-0 left-1/2 h-full w-auto max-w-full -translate-x-1/2 object-contain object-bottom"
              />
            )}
            {/* Sombra de baixo para cima: o nome (embaixo) fica legível sobre a imagem. */}
            {tile.image && (
              <span
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"
              />
            )}
            <span
              className={`absolute left-3 bottom-3 z-10 text-white font-display ${tile.fontSize} leading-none drop-shadow`}
            >
              {tile.label}
            </span>
          </>
        );
        return tile.href ? (
          <Link
            key={tile.slug}
            href={tile.href}
            aria-label={banner ? tile.label : undefined}
            style={bannerStyle(banner)}
            className={className}
          >
            {content}
          </Link>
        ) : (
          <button
            key={tile.slug}
            type="button"
            aria-label={banner ? tile.label : undefined}
            onClick={() => toast.comingSoon(titleCase(tile.label))}
            style={bannerStyle(banner)}
            className={className}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
