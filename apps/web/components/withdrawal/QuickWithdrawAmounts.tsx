'use client';

import { Flame } from 'lucide-react';
import { formatBrl } from '@/lib/currency';
import { HOT_WITHDRAWAL_CENTS, QUICK_WITHDRAWAL_CENTS } from '@/lib/withdrawal';

interface QuickWithdrawAmountsProps {
  amountCents: number;
  availableCents: number;
  onSelect: (cents: number) => void;
}

/** Valores rápidos (definem o valor). Os acima do disponível ficam desabilitados. */
export default function QuickWithdrawAmounts({ amountCents, availableCents, onSelect }: QuickWithdrawAmountsProps) {
  return (
    <div className="grid grid-cols-4 gap-2 rounded-2xl bg-white p-3 shadow-sm">
      {QUICK_WITHDRAWAL_CENTS.map((cents) => {
        const unavailable = cents > availableCents;
        const selected = amountCents === cents;
        return (
          <button
            key={cents}
            type="button"
            onClick={() => onSelect(cents)}
            disabled={unavailable}
            aria-pressed={selected}
            aria-label={`Sacar ${formatBrl(cents)}`}
            className={`relative h-11 rounded-xl border text-[14px] font-bold transition-transform active:scale-95 disabled:active:scale-100 ${
              selected
                ? 'border-brand-primary bg-brand-primary text-white'
                : 'border-gray-200 bg-white text-gray-800 disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-300'
            }`}
          >
            {cents === HOT_WITHDRAWAL_CENTS && (
              <span
                aria-hidden
                className="absolute -top-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-brand-orange px-1.5 py-px text-[8px] font-bold uppercase leading-tight text-white"
              >
                <Flame className="h-2 w-2" />
                Hot
              </span>
            )}
            R$ {cents / 100}
          </button>
        );
      })}
    </div>
  );
}
