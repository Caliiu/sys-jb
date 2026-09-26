'use client';

import { formatBrl } from '@/lib/currency';
import { MIN_RECHARGE_CENTS, POPULAR_AMOUNT_CENTS, QUICK_AMOUNTS_CENTS } from '@/lib/recharge';

interface QuickAmountsProps {
  amountCents: number;
  onAdd: (cents: number) => void;
  onClear: () => void;
}

/** Botões de valor rápido (somam ao valor atual), valor mínimo e "Limpar". */
export default function QuickAmounts({ amountCents, onAdd, onClear }: QuickAmountsProps) {
  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {QUICK_AMOUNTS_CENTS.map((cents) => {
          const popular = cents === POPULAR_AMOUNT_CENTS;
          return (
            <button
              key={cents}
              type="button"
              onClick={() => onAdd(cents)}
              aria-label={`Adicionar ${formatBrl(cents)}`}
              className={`relative h-12 rounded-xl bg-white text-[14px] font-bold text-brand-primary shadow-sm active:scale-95 transition-transform ${
                popular ? 'border border-brand-primary' : 'border border-transparent'
              }`}
            >
              {popular && (
                <span
                  aria-hidden
                  className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-brand-primary px-1.5 py-px text-[8px] font-bold uppercase leading-tight tracking-wide text-white"
                >
                  Popular
                </span>
              )}
              +{cents / 100}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-[12px]">
        <span className="text-slate-400">Mínimo {formatBrl(MIN_RECHARGE_CENTS)}</span>
        <button
          type="button"
          onClick={onClear}
          disabled={amountCents === 0}
          className="font-bold text-brand-primary disabled:opacity-40"
        >
          Limpar
        </button>
      </div>
    </div>
  );
}
