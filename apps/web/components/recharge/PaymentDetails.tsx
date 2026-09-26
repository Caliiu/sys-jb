'use client';

import { ShieldAlert } from 'lucide-react';
import { useSecondsUntil } from '@/hooks/useCountdown';
import { maskCpfInput } from '@/lib/masks';
import { formatBrl, type PixCharge } from '@/lib/recharge';
import PaymentTimer from './PaymentTimer';
import PixKeyCard from './PixKeyCard';
import PixQrToggle from './PixQrToggle';

interface PaymentDetailsProps {
  /** Titular do CPF: o Pix só é aceito se sair de uma conta desse titular. */
  holderName: string;
  holderDocument: string;
  charge: PixCharge;
  /** Volta ao formulário para gerar outra cobrança. */
  onRestart: () => void;
}

/** Etapa 2 da recarga: chave Pix (copia e cola), QR Code e tempo para pagar. */
export default function PaymentDetails({ holderName, holderDocument, charge, onRestart }: PaymentDetailsProps) {
  const seconds = useSecondsUntil(charge.expiresAt);
  const expired = seconds === 0;

  return (
    <div className="flex flex-col gap-4 px-3.5 pt-4 pb-8">
      {charge.isTest && (
        <p role="note" className="rounded-xl bg-slate-800 px-3 py-2 text-center text-[12px] font-semibold text-white">
          Cobrança de teste (desenvolvimento): nenhum banco consegue pagar esta chave.
        </p>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] leading-snug text-amber-800">
        <p className="flex items-center gap-1.5 text-[13px] font-bold">
          <ShieldAlert className="h-4 w-4 text-amber-500" aria-hidden />
          Atenção
        </p>
        <p className="mt-1">
          Só serão aceitos pagamentos do titular: <strong className="uppercase">{holderName}</strong> · CPF{' '}
          <strong>{maskCpfInput(holderDocument)}</strong>.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold text-slate-900">Chave Pix (copia e cola)</h2>
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-[12px] font-bold text-red-700 tabular-nums">
          {formatBrl(charge.amountCents)}
        </span>
      </div>

      <PixKeyCard code={charge.code} disabled={expired} />
      <p className="text-center text-[12px] text-slate-400">
        Cole a chave no seu app do banco e realize o pagamento via Pix.
      </p>

      <PixQrToggle code={charge.code} disabled={expired} />
      <PaymentTimer seconds={seconds} durationSeconds={charge.durationSeconds} onRestart={onRestart} />
    </div>
  );
}
