'use client';

import { Clock } from 'lucide-react';
import type { DrawSchedule } from '@sysjb/contracts';
import { formatCountdown, useNowSeconds } from '@/hooks/useCountdown';
import { nextDraw } from '@/lib/next-draw';

interface SorteioBannerProps {
  /** Cadastro de sorteios da banca; null = não foi possível consultar (o banner não aparece). */
  schedule: DrawSchedule | null;
  /** Momento da renderização no servidor (ISO 8601): escolhe o sorteio até o relógio do navegador assumir. */
  nowIso: string;
}

/**
 * Próximo sorteio (Loterias ou Fazendinha) com contagem regressiva até o horário dele. Quando o horário
 * chega, passa sozinho para o seguinte. Sem sorteio pela frente, o banner não aparece.
 */
export default function SorteioBanner({ schedule, nowIso }: SorteioBannerProps) {
  const clock = useNowSeconds();
  if (!schedule) return null;
  const draw = nextDraw(clock === null ? nowIso : new Date(clock * 1000).toISOString(), schedule);
  if (!draw) return null;
  // "00 : 53 : 40": espaço em volta dos dois-pontos.
  const countdown =
    clock === null ? null : formatCountdown(Date.parse(draw.startsAt) - clock * 1000).replaceAll(':', ' : ');

  return (
    <div className="mx-4 mt-1 flex items-center justify-between bg-brand-primary rounded-xl2 px-4 py-2.5 shadow-card">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-brand-gold motion-safe:animate-blink" aria-hidden />
        <div className="leading-tight">
          <p className="text-[10px] text-white/70 font-semibold tracking-wide">PRÓXIMO SORTEIO</p>
          <p className="text-[13px] text-white font-bold">{draw.label}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 bg-black/25 rounded-md px-2.5 py-1">
        <Clock className="w-3.5 h-3.5 text-white" aria-hidden />
        <time dateTime={draw.startsAt} className="text-white text-[13px] font-bold tabular-nums">
          {countdown ?? '-- : -- : --'}
        </time>
      </div>
    </div>
  );
}
