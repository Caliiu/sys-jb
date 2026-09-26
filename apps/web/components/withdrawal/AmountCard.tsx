'use client';

import { formatCents } from '@/lib/currency';
import { MIN_WITHDRAWAL_CENTS, parseWithdrawalAmount, withdrawalAmountProblem } from '@/lib/withdrawal';

interface AmountCardProps {
  cents: number;
  availableCents: number;
  holderName: string;
  holderDocument: string;
  onChange: (cents: number) => void;
}

/** Valor do saque em destaque (máscara de moeda), dica ou erro, e para quem vai. */
export default function AmountCard({ cents, availableCents, holderName, holderDocument, onChange }: AmountCardProps) {
  const problem = withdrawalAmountProblem(cents, availableCents);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <label htmlFor="withdraw-amount" className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">
          Valor do saque<span className="sr-only"> em reais</span>
        </label>
        <button
          type="button"
          onClick={() => onChange(availableCents)}
          disabled={availableCents < MIN_WITHDRAWAL_CENTS}
          className="rounded-full bg-brand-primary px-3 py-1 text-[12px] font-bold text-white active:scale-95 transition-transform disabled:opacity-60"
        >
          Valor máximo
        </button>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span aria-hidden className="text-[26px] font-bold text-brand-primary">
          R$
        </span>
        <input
          id="withdraw-amount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={formatCents(cents)}
          onChange={(event) => {
            const next = parseWithdrawalAmount(event.target.value);
            if (next !== null) onChange(next);
          }}
          aria-invalid={problem ? true : undefined}
          aria-describedby="withdraw-amount-hint"
          className="w-full min-w-0 bg-transparent text-[44px] font-extrabold leading-none tabular-nums text-gray-900 caret-brand-primary outline-none"
        />
      </div>

      <p
        id="withdraw-amount-hint"
        role={problem ? 'alert' : undefined}
        className={`mt-3 text-[12.5px] ${problem ? 'font-medium text-red-600' : 'text-gray-400'}`}
      >
        {problem ?? 'Digite o valor que deseja resgatar'}
      </p>

      <p className="mt-3 border-t border-gray-100 pt-3 text-[12px] text-gray-500">
        Para <strong className="font-semibold uppercase text-gray-800">{holderName}</strong>
        <span aria-hidden> · </span>
        <span className="sr-only">, CPF </span>
        <span className="tabular-nums">{holderDocument}</span>
      </p>
    </section>
  );
}
