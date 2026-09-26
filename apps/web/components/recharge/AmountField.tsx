'use client';

import { formatBrl, MIN_RECHARGE_CENTS, parseAmountInput } from '@/lib/recharge';

interface AmountFieldProps {
  cents: number;
  onChange: (cents: number) => void;
}

/** Valor da recarga em destaque, com máscara de moeda. */
export default function AmountField({ cents, onChange }: AmountFieldProps) {
  return (
    <div>
      <label htmlFor="recharge-amount" className="block text-center text-[14px] font-semibold text-slate-500">
        Quanto deseja creditar?
      </label>
      <div className="mt-3 rounded-2xl bg-white px-4 py-6 shadow-card">
        <input
          id="recharge-amount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-describedby="recharge-min"
          value={formatBrl(cents)}
          onChange={(event) => {
            const next = parseAmountInput(event.target.value);
            if (next !== null) onChange(next);
          }}
          className="w-full bg-transparent text-center font-display text-[36px] leading-none text-slate-900 tabular-nums caret-brand-primary outline-none"
        />
      </div>
      <span id="recharge-min" className="sr-only">
        Valor mínimo {formatBrl(MIN_RECHARGE_CENTS)}
      </span>
    </div>
  );
}
