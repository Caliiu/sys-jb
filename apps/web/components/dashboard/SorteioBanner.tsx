'use client';

import { Clock } from 'lucide-react';
import { useCountdown } from '@/hooks/useCountdown';

export interface NextDraw {
  label: string;
  /** Início do sorteio (ISO 8601). */
  startsAt: string;
}

/**
 * Próximo sorteio com contagem regressiva real. No original o contador era um texto fixo;
 * aqui, sem sorteio cadastrado (`draw` nulo), o banner não aparece.
 */
export default function SorteioBanner({ draw }: { draw: NextDraw | null }) {
  if (!draw) return null;
  return <SorteioBannerContent draw={draw} />;
}

function SorteioBannerContent({ draw }: { draw: NextDraw }) {
  const countdown = useCountdown(draw.startsAt);

  return (
    <div className="mx-4 mt-1 flex items-center justify-between bg-brand-primary rounded-xl2 px-4 py-2.5 shadow-card">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-brand-gold" aria-hidden />
        <div className="leading-tight">
          <p className="text-[10px] text-white/70 font-semibold tracking-wide">PRÓXIMO SORTEIO</p>
          <p className="text-[13px] text-white font-bold">{draw.label}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 bg-black/25 rounded-md px-2.5 py-1">
        <Clock className="w-3.5 h-3.5 text-white" aria-hidden />
        <time dateTime={draw.startsAt} className="text-white text-[13px] font-bold tabular-nums">
          {countdown ?? '--:--:--'}
        </time>
      </div>
    </div>
  );
}
