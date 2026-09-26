'use client';

import { Ban } from 'lucide-react';
import { DESTINATIONS, type RechargeDestination } from '@/lib/recharge';

interface DestinationPickerProps {
  value: RechargeDestination | null;
  onChange: (value: RechargeDestination) => void;
}

/** Escolha do destino do crédito (radios nativos: teclado e leitor de tela de graça). */
export default function DestinationPicker({ value, onChange }: DestinationPickerProps) {
  return (
    <fieldset>
      <legend className="text-[15px] font-bold text-slate-900">Onde usar o crédito</legend>
      <div className="mt-3 flex flex-col gap-3">
        {DESTINATIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 has-checked:border-brand-primary has-focus-visible:ring-2 has-focus-visible:ring-brand-primary/40"
          >
            <input
              type="radio"
              name="recharge-destination"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 peer-checked:border-brand-primary peer-checked:after:h-2.5 peer-checked:after:w-2.5 peer-checked:after:rounded-full peer-checked:after:bg-brand-primary"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold leading-tight text-slate-900">{option.label}</span>
              <span className="block text-[12px] leading-tight text-slate-400">{option.description}</span>
            </span>
            {!option.bonusAvailable && (
              <span className="flex shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                <Ban className="h-3 w-3" aria-hidden />
                Bônus indisponível
              </span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
