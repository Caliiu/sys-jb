'use client';

import { ArrowRight, CircleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { formatCents } from '@/lib/currency';
import { createPixChargeAction } from '@/app/recharge-actions';
import { addAmount, type PixCharge, type RechargeDestination, validateRecharge } from '@/lib/recharge';
import AmountField from './AmountField';
import DestinationPicker from './DestinationPicker';
import QuickAmounts from './QuickAmounts';

interface RechargeFormProps {
  /** Chamado com a cobrança gerada (a tela passa para a etapa de pagamento). */
  onCharge: (charge: PixCharge) => void;
  balanceCents: number;
  balanceVisible: boolean;
}

/** Etapa 1 da recarga: valor e destino do crédito. */
export default function RechargeForm({ onCharge, balanceCents, balanceVisible }: RechargeFormProps) {
  const router = useRouter();
  const [amountCents, setAmountCents] = useState(0);
  const [destination, setDestination] = useState<RechargeDestination | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function changeAmount(cents: number) {
    setError(null);
    setAmountCents(cents);
  }

  function changeDestination(value: RechargeDestination) {
    setError(null);
    setDestination(value);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const message = validateRecharge(amountCents, destination);
    if (message || !destination) {
      setError(message);
      return;
    }

    setSubmitting(true);
    try {
      const result = await createPixChargeAction({ amountCents, destination });
      if (result.ok) onCharge(result.charge);
      else if (result.code === 'SESSION_INVALID') router.replace('/login');
      else setError(result.message);
    } catch {
      setError('Não foi possível gerar o Pix. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 px-3.5 pt-5 pb-8">
      <div>
        <AmountField cents={amountCents} onChange={changeAmount} />
        <p className="mt-2 text-center text-[12px] text-slate-400">
          Saldo atual:{' '}
          <span className="font-bold text-green-600 tabular-nums">
            R$ {balanceVisible ? formatCents(balanceCents) : '••••'}
          </span>
        </p>
      </div>

      <QuickAmounts
        amountCents={amountCents}
        onAdd={(cents) => changeAmount(addAmount(amountCents, cents))}
        onClear={() => changeAmount(0)}
      />

      <DestinationPicker value={destination} onChange={changeDestination} />

      <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800">
        <CircleAlert className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />O crédito só poderá ser usado na
        modalidade selecionada.
      </p>

      {error && (
        <p role="alert" className="text-center text-[13px] font-semibold text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-primary to-[color-mix(in_srgb,var(--brand-primary)_80%,white)] text-[16px] font-bold text-white shadow-[0_8px_20px_-6px_var(--brand-primary)] active:scale-[0.98] transition-transform disabled:opacity-70"
      >
        {submitting ? 'Gerando Pix…' : 'Avançar'}
        <ArrowRight className="h-4.5 w-4.5" size={18} aria-hidden />
      </button>
    </form>
  );
}
