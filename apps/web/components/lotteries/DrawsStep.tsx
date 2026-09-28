'use client';

import { type DrawSchedule, drawsOn, groupDraws, isDrawOpenOn } from '@sysjb/contracts';
import { Check, ChevronDown, ChevronUp, Clock, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLocalStorageItem } from '@/hooks/useLocalStorageItem';
import { FAVORITES_KEY, drawKey } from '@/lib/lotteries';
import { FooterButton } from './EntrySteps';

interface DrawsStepProps {
  nowIso: string;
  /** Cadastro de sorteios da banca (dias da semana, exceções e horário de venda). */
  schedule: DrawSchedule;
  /** YYYY-MM-DD: cada sorteio corre nos dias dele (a Federal, quartas e domingos), salvo exceções. */
  drawDate: string;
  selected: string[];
  onChange: (keys: string[]) => void;
  onNext: () => void;
}

/**
 * Etapa 7: loterias (extrações) do dia, agrupadas; várias podem ser escolhidas. Hoje, só as que ainda não
 * fecharam. Favoritas (estrela) sobem para o topo; ficam só neste aparelho.
 */
export default function DrawsStep({ nowIso, schedule, drawDate, selected, onChange, onNext }: DrawsStepProps) {
  const favoritesItem = useLocalStorageItem(FAVORITES_KEY);
  const favorites = useMemo<string[]>(() => {
    try {
      const parsed: unknown = JSON.parse(favoritesItem.raw ?? '[]');
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }, [favoritesItem.raw]);
  const [open, setOpen] = useState<string | null>(null);

  // Grupos com sorteio aberto, na ordem do cadastro; favoritos pelo nome do grupo.
  const groups = groupDraws(
    drawsOn(schedule, drawDate, 'lotteries').filter((d) => isDrawOpenOn(nowIso, drawDate, d.closesAt)),
  )
    .map((group) => ({ ...group, id: group.label }))
    .sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)));

  const toggleFavorite = (id: string) =>
    favoritesItem.write(
      JSON.stringify(favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id]),
    );
  const toggleDraw = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  return (
    <>
      <main className="px-3 py-3 pb-28">
        {groups.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-gray-500">Não há mais loterias abertas neste dia.</p>
        ) : (
          <ul aria-label="Loterias" className="space-y-3">
            {groups.map((group) => {
              const count = group.draws.filter((d) => selected.includes(drawKey(d))).length;
              const isOpen = open === group.id;
              const favorite = favorites.includes(group.id);
              const panelId = `draws-${group.label.replace(/[^A-Za-z0-9]+/g, '-')}`;
              return (
                <li key={group.id} className="rounded-xl bg-white shadow-card">
                  <div className="flex items-center gap-2 px-3 py-3.5">
                    <button
                      type="button"
                      onClick={() => toggleFavorite(group.id)}
                      aria-pressed={favorite}
                      aria-label={favorite ? `Desfavoritar ${group.label}` : `Favoritar ${group.label}`}
                    >
                      <Star
                        className={`w-5 h-5 ${favorite ? 'fill-brand-gold text-brand-gold' : 'text-gray-300'}`}
                        aria-hidden
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : group.id)}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      <span className="flex-1 text-[14px] font-bold text-gray-900">{group.label}</span>
                      <span
                        aria-label={`${count} escolhida${count === 1 ? '' : 's'}`}
                        className="min-w-6 h-6 rounded-full bg-brand-primary px-1.5 text-center text-[12px] font-bold leading-6 text-white"
                      >
                        {count}
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" aria-hidden />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" aria-hidden />
                      )}
                    </button>
                  </div>
                  {isOpen && (
                    <ul
                      id={panelId}
                      aria-label={`Extrações ${group.label}`}
                      className="border-t border-gray-100 px-3 pb-2"
                    >
                      {group.draws.map((draw) => {
                        const key = drawKey(draw);
                        const checked = selected.includes(key);
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={checked}
                              onClick={() => toggleDraw(key)}
                              className="flex w-full items-center gap-3 border-b border-gray-100 py-2.5 text-left last:border-0"
                            >
                              <span
                                className={`flex w-5 h-5 items-center justify-center rounded-full border-2 ${
                                  checked ? 'border-brand-primary bg-brand-primary' : 'border-gray-300'
                                }`}
                              >
                                {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} aria-hidden />}
                              </span>
                              <span className="flex-1 text-[14px] text-gray-900">{draw.name}</span>
                              <span className="flex items-center gap-1 text-[13px] text-gray-400 tabular-nums">
                                <Clock className="w-3.5 h-3.5" aria-hidden />
                                {draw.closesAt}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <FooterButton label="Avançar" onClick={onNext} disabled={selected.length === 0} />
    </>
  );
}
