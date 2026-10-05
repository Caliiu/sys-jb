'use client';

import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import type { GameModalityResponse } from '@/lib/modalities';
import { bannerStyle, findModality } from './modality-tiles';

interface CassinoBannerProps {
  modalities: GameModalityResponse[];
  isLoading: boolean;
}

const baseClass =
  'relative w-[calc(100%-2rem)] mx-4 mt-1 h-28 rounded-xl2 overflow-hidden shadow-card text-left block active:scale-[0.98] transition-transform';

export default function CassinoBanner({ modalities, isLoading }: CassinoBannerProps) {
  const modality = findModality(modalities, 'cassino');
  if (!isLoading && !modality) return null;

  if (modality?.bannerUrl) {
    return (
      <Link
        href={ROUTES.casino}
        aria-label="Acessar cassino"
        style={bannerStyle(modality.bannerUrl)}
        className={baseClass}
      />
    );
  }

  return (
    <Link href={ROUTES.casino} className={baseClass}>
      <span className="absolute inset-0 bg-gradient-to-br from-purple-900 via-fuchsia-800 to-rose-700" />
      <span
        className="absolute inset-y-0 right-0 w-[68%]"
        style={{
          maskImage: 'linear-gradient(to right, transparent, #000 45%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, #000 45%)',
        }}
      >
        <Image
          src="/banners/cassino.webp"
          alt=""
          fill
          sizes="(max-width: 480px) 70vw, 340px"
          className="object-cover object-[50%_35%]"
        />
      </span>
      <span className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/10 to-transparent" />
      <span className="relative h-full flex flex-col justify-center px-4">
        <span className="text-white font-display text-[19px] leading-none">CASSINO</span>
        <span className="flex items-center gap-1 text-white/90 text-[12px] font-medium mt-1.5">
          Acessar cassino <ArrowRight className="w-3.5 h-3.5" aria-hidden />
        </span>
      </span>
    </Link>
  );
}
