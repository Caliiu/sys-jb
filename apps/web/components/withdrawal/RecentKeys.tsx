'use client';

import { History } from 'lucide-react';
import { PIX_KEY_INFO } from '@/lib/pix-key';
import { type RecentPixKey, recentKeyLabel } from '@/lib/recent-pix-keys';
import { PIX_KEY_ICONS } from './pix-key-icons';

interface RecentKeysProps {
  keys: readonly RecentPixKey[];
  onSelect: (entry: RecentPixKey) => void;
  onClear: () => void;
}

/** Chaves Pix usadas antes: tocar em uma escolhe o tipo e já preenche o campo. Sem chaves, não aparece. */
export default function RecentKeys({ keys, onSelect, onClear }: RecentKeysProps) {
  if (keys.length === 0) return null;

  return (
    <section aria-labelledby="recent-keys-title" className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2
          id="recent-keys-title"
          className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500"
        >
          <History className="h-3.5 w-3.5" aria-hidden />
          Chaves recentes
        </h2>
        <button type="button" onClick={onClear} className="text-[12px] font-semibold text-gray-400">
          Limpar
        </button>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {keys.map((entry) => {
          const Icon = PIX_KEY_ICONS[entry.type];
          const label = recentKeyLabel(entry);
          return (
            <li key={`${entry.type}:${entry.value}`}>
              <button
                type="button"
                onClick={() => onSelect(entry)}
                aria-label={`Usar chave ${PIX_KEY_INFO[entry.type].label} ${label}`}
                className="flex max-w-[230px] items-center gap-1.5 rounded-full border border-gray-200 bg-[#F6F6F6] px-3 py-2 text-[13px] font-semibold text-gray-800 active:scale-95 transition-transform"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
                <span className="truncate tabular-nums">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
