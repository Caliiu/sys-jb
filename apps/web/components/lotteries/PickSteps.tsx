'use client';

import {
  LOTTERY_GAME_TYPES,
  type LotteryGame,
  type LotteryModality,
  type LotteryPlacement,
  type PublicQuotes,
  LOTTERY_MODALITIES,
  isLotteryGame,
  lotteryQuoteCents,
} from '@sysjb/contracts';
import { ChevronRight, Clover, Repeat2, Search } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { type LotteryDay, quoteBadge } from '@/lib/lotteries';
import { LOTTERY_STEP_COUNT } from './LotteryBar';
import LotteryToolsNav from './LotteryToolsNav';

/** Cores de cada tipo de jogo: faixa do título (header) e trevo (bg/fg), como no print. */
const TYPE_COLORS: Record<string, { header: string; bg: string; fg: string }> = {
  tradicional: { header: 'bg-green-700', bg: 'bg-green-50', fg: 'text-green-600' },
  tradicional_10: { header: 'bg-green-700', bg: 'bg-green-50', fg: 'text-green-600' },
  uruguaia: { header: 'bg-amber-600', bg: 'bg-yellow-50', fg: 'text-yellow-500' },
  quininha: { header: 'bg-indigo-700', bg: 'bg-indigo-50', fg: 'text-indigo-700' },
  seninha: { header: 'bg-fuchsia-700', bg: 'bg-fuchsia-50', fg: 'text-fuchsia-600' },
  super15: { header: 'bg-orange-600', bg: 'bg-orange-50', fg: 'text-orange-500' },
};

const cardClass = 'rounded-xl bg-white shadow-card';

/** Cartão fixo no rodapé: o que já foi escolhido e a etapa ("4/9"). */
export function SummaryCard({
  title,
  subtitle,
  step,
  total = LOTTERY_STEP_COUNT,
}: {
  title: string;
  subtitle: string;
  step: number;
  /** Quantidade de etapas do fluxo (Repetir pule tem 7). */
  total?: number;
}) {
  return (
    <div className={`${cardClass} flex items-center gap-3 px-3 py-3`}>
      <span className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
        <Clover className="w-5 h-5 text-green-600" aria-hidden />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-gray-900 truncate">{title}</span>
        <span className="block text-[13px] text-gray-500 truncate">{subtitle}</span>
      </span>
      <span className="rounded-full bg-brand-primary px-2.5 py-0.5 text-[12px] font-bold text-white tabular-nums">
        {step}/{total}
      </span>
    </div>
  );
}

function ListButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`${cardClass} w-full flex items-center gap-3 px-3 py-3.5 text-left active:scale-[0.99] transition-transform`}
      >
        {children}
        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" aria-hidden />
      </button>
    </li>
  );
}

/** Busca fixa acima do cartão de resumo. */
function SearchBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={`${cardClass} flex items-center gap-2 h-12 px-3 border border-gray-200`}>
      <Search className="w-4 h-4 text-gray-400" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${label}...`}
        aria-label={label}
        className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-gray-400"
      />
    </label>
  );
}

/** Etapa 1: tipo de jogo (Tradicional 1/7 e 1/10; os outros avisam "em breve") e "Repetir pule". */
export function TypeStep({
  onPick,
  onRepeat,
  onComingSoon,
}: {
  onPick: (game: LotteryGame) => void;
  onRepeat: () => void;
  onComingSoon: (label: string) => void;
}) {
  return (
    <main className="px-3 py-3 pb-28">
      <ul aria-label="Tipos de jogo" className="grid grid-cols-2 gap-3">
        {LOTTERY_GAME_TYPES.map((type) => {
          const color = TYPE_COLORS[type.id] ?? TYPE_COLORS.tradicional!;
          return (
            <li key={type.id}>
              <button
                type="button"
                onClick={() => (type.available && isLotteryGame(type.id) ? onPick(type.id) : onComingSoon(type.label))}
                className={`${cardClass} w-full overflow-hidden text-center active:scale-[0.98] transition-transform`}
              >
                <span className={`block ${color.header} px-2 py-1.5`}>
                  <span className="block truncate text-[16px] font-bold leading-tight text-white">{type.label}</span>
                  <span className="block truncate text-[12px] leading-tight text-white/75">{type.description}</span>
                </span>
                <span className="flex justify-center py-4">
                  <span className={`w-16 h-16 rounded-2xl ${color.bg} flex items-center justify-center`}>
                    <Clover className={`w-10 h-10 ${color.fg}`} strokeWidth={2.5} aria-hidden />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onRepeat}
        className={`${cardClass} mt-3 w-full flex items-center gap-3 px-3 py-3.5 text-left`}
      >
        <span className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
          <Repeat2 className="w-5 h-5 text-brand-primary" aria-hidden />
        </span>
        <span className="flex-1">
          <span className="block text-[15px] font-bold text-gray-900">Repetir pule</span>
          <span className="block text-[13px] text-gray-500">Refaça uma aposta anterior</span>
        </span>
        <ChevronRight className="w-4 h-4 text-gray-300" aria-hidden />
      </button>

      <LotteryToolsNav />
    </main>
  );
}

/** Etapa 2: data (hoje e os próximos 6 dias), em cartões grandes; a etiqueta marca os dias com Federal. */
export function DateStep({ days, onPick }: { days: LotteryDay[]; onPick: (day: LotteryDay) => void }) {
  return (
    <main className="px-3 py-3 pb-28">
      <ul aria-label="Datas" className="grid grid-cols-2 gap-3">
        {days.map((day) => (
          <li key={day.date}>
            <button
              type="button"
              onClick={() => onPick(day)}
              aria-label={`${day.title}, ${day.label}${day.hasFederal ? ', com Federal' : ''}`}
              className="relative w-full overflow-hidden rounded-xl bg-white text-center shadow-card active:scale-[0.98] transition-transform"
            >
              <span className="block bg-brand-primary py-2 text-[16px] font-bold text-white">{day.title}</span>
              <span className="block py-6 text-[56px] font-extrabold leading-none text-brand-primary tabular-nums">
                {day.dayOfMonth}
              </span>
              {day.hasFederal && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-md bg-brand-gold px-3 py-0.5 text-[12px] font-semibold text-gray-900">
                  Federal
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

/** Etapa 3: modalidade (as desligadas na cotação da banca não aparecem). */
export function ModalityStep({
  quotes,
  onPick,
  footer,
}: {
  quotes: PublicQuotes;
  onPick: (modality: LotteryModality) => void;
  footer: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toUpperCase();
  const available = LOTTERY_MODALITIES.filter((m) => lotteryQuoteCents(m, quotes) > 0 && (!q || m.label.includes(q)));
  return (
    <>
      <main className="px-3 py-3 pb-44">
        <ul aria-label="Modalidades" className="space-y-2">
          {available.map((m) => (
            <ListButton key={m.id} onClick={() => onPick(m)}>
              <span className="flex-1 text-[14px] font-bold text-gray-900">{m.label}</span>
              {m.kind !== 'inverted' && m.kind !== 'milhar_centena' && (
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-[12px] font-semibold text-green-600 tabular-nums">
                  {quoteBadge(lotteryQuoteCents(m, quotes))}
                </span>
              )}
            </ListButton>
          ))}
          {available.length === 0 && (
            <li className="py-8 text-center text-[14px] text-gray-500">Nenhuma modalidade.</li>
          )}
        </ul>
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-[480px] space-y-2 bg-gradient-to-t from-[#F4F6F6] via-[#F4F6F6] px-3 pt-4 pb-3">
        <SearchBox label="Buscar modalidade" value={query} onChange={setQuery} />
        {footer}
      </div>
    </>
  );
}

/** Etapa 4: colocação (combos têm uma só). */
export function PlacementStep({
  placements,
  onPick,
  footer,
}: {
  placements: LotteryPlacement[];
  onPick: (placement: LotteryPlacement) => void;
  footer: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toUpperCase();
  const list = placements.filter((p) => !q || p.label.includes(q));
  return (
    <>
      <main className="px-3 py-3 pb-44">
        <ul aria-label="Colocações" className="space-y-2">
          {list.map((p) => (
            <ListButton key={p.id} onClick={() => onPick(p)}>
              <span className="flex-1 text-[14px] font-bold text-gray-900">{p.label}</span>
              {p.badge && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                    p.badge.tone === 'green' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  {p.badge.text}
                </span>
              )}
            </ListButton>
          ))}
        </ul>
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-[480px] space-y-2 bg-gradient-to-t from-[#F4F6F6] via-[#F4F6F6] px-3 pt-4 pb-3">
        <SearchBox label="Buscar colocação" value={query} onChange={setQuery} />
        {footer}
      </div>
    </>
  );
}
