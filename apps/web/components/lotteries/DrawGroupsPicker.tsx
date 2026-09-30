'use client';

import type { DrawGroup, PublicDraw } from '@sysjb/contracts';
import { Check, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useLocalStorageItem } from '@/hooks/useLocalStorageItem';
import { FAVORITES_KEY } from '@/lib/lotteries';

interface DrawGroupsPickerProps {
  /** Grupos na ordem do cadastro (os favoritos sobem para o topo). */
  groups: DrawGroup<PublicDraw>[];
  /** Chaves dos sorteios marcados (ver `keyOf`). */
  selected: string[];
  onChange: (keys: string[]) => void;
  keyOf: (draw: PublicDraw) => string;
  /** Informação à direita de cada sorteio (ex.: horário de venda na compra). */
  aside?: (draw: PublicDraw) => ReactNode;
}

/**
 * Lista de loterias agrupada (sanfona): estrela para favoritar o grupo (fica neste aparelho, a mesma lista na
 * compra e nos resultados), contador de marcados e os sorteios do grupo com marcação redonda; vários podem ser
 * escolhidos.
 */
export default function DrawGroupsPicker({ groups, selected, onChange, keyOf, aside }: DrawGroupsPickerProps) {
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

  const sorted = [...groups].sort((a, b) => Number(favorites.includes(b.label)) - Number(favorites.includes(a.label)));

  const toggleFavorite = (label: string) =>
    favoritesItem.write(
      JSON.stringify(favorites.includes(label) ? favorites.filter((f) => f !== label) : [...favorites, label]),
    );
  const toggleDraw = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  return (
    <ul aria-label="Loterias" className="space-y-3">
      {sorted.map((group) => {
        const count = group.draws.filter((d) => selected.includes(keyOf(d))).length;
        const isOpen = open === group.label;
        const favorite = favorites.includes(group.label);
        const panelId = `draws-${group.label.replace(/[^A-Za-z0-9]+/g, '-')}`;
        return (
          <li key={group.label} className="rounded-xl bg-white shadow-card">
            <div className="flex items-center gap-2 px-3 py-3.5">
              <button
                type="button"
                onClick={() => toggleFavorite(group.label)}
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
                onClick={() => setOpen(isOpen ? null : group.label)}
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
              <ul id={panelId} aria-label={`Extrações ${group.label}`} className="border-t border-gray-100 px-3 pb-2">
                {group.draws.map((draw) => {
                  const key = keyOf(draw);
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
                        {aside?.(draw)}
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
  );
}
