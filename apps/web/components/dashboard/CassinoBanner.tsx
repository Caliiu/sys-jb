'use client';

import { ArrowRight } from 'lucide-react';
import type { GameModalityResponse } from '@/lib/modalities';
import { useToast } from '../ui/Toast';
import { bannerStyle, findModality } from './modality-tiles';

interface CassinoBannerProps {
  modalities: GameModalityResponse[];
  isLoading: boolean;
}

const baseClass =
  'relative w-[calc(100%-2rem)] mx-4 mt-1 h-28 rounded-xl2 overflow-hidden shadow-card text-left block active:scale-[0.98] transition-transform';

export default function CassinoBanner({ modalities, isLoading }: CassinoBannerProps) {
  const toast = useToast();
  const modality = findModality(modalities, 'cassino');
  if (!isLoading && !modality) return null;

  const open = () => toast.comingSoon('Cassino');

  if (modality?.bannerUrl) {
    return (
      <button
        type="button"
        aria-label="Acessar cassino"
        onClick={open}
        style={bannerStyle(modality.bannerUrl)}
        className={baseClass}
      />
    );
  }

  return (
    <button type="button" onClick={open} className={baseClass}>
      <span className="absolute inset-0 bg-gradient-to-br from-purple-900 via-fuchsia-800 to-rose-700" />
      <span className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      <span className="relative h-full flex flex-col justify-center px-4">
        <span className="text-white font-display text-[19px] leading-none">CASSINO</span>
        <span className="flex items-center gap-1 text-white/90 text-[12px] font-medium mt-1.5">
          Acessar cassino <ArrowRight className="w-3.5 h-3.5" aria-hidden />
        </span>
      </span>
    </button>
  );
}
