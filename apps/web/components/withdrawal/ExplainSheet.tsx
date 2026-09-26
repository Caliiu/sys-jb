'use client';

import { CircleAlert } from 'lucide-react';
import { useId } from 'react';
import BottomSheet from './BottomSheet';

interface ExplainSheetProps {
  open: boolean;
  onClose: () => void;
}

/** "Entenda": por que bônus e recargas não podem ser resgatados e como o saldo é usado. */
export default function ExplainSheet({ open, onClose }: ExplainSheetProps) {
  const titleId = useId();

  return (
    <BottomSheet open={open} onClose={onClose} titleId={titleId}>
      <h2 id={titleId} className="flex items-center gap-2 text-[15px] font-bold text-brand-orangeDark">
        <CircleAlert className="h-5 w-5 shrink-0" aria-hidden />
        Bônus e recargas não podem ser resgatados
      </h2>

      <h3 className="mt-5 text-[15px] font-bold text-gray-900">Uso do saldo nas apostas</h3>
      <p className="mt-2 text-[14px] text-gray-800">
        <span className="whitespace-nowrap">1º Saldo livre</span> <span aria-hidden>›</span>
        <span className="sr-only">, depois</span> <span className="whitespace-nowrap">2º Saldo recarga</span>{' '}
        <span aria-hidden>›</span>
        <span className="sr-only">, depois</span> <span className="whitespace-nowrap">3º Bônus</span>
      </p>

      <h3 className="mt-5 text-[15px] font-bold text-gray-900">Disponível para saque</h3>
      <p className="mt-2 text-[14px] text-gray-800">
        Saldo total <span aria-hidden>( − )</span>
        <span className="sr-only"> menos </span> Recarga <span aria-hidden>( − )</span>
        <span className="sr-only"> menos </span> Bônus
      </p>

      <button
        type="button"
        onClick={onClose}
        className="mt-6 flex h-11 w-full items-center justify-center rounded-xl bg-brand-orange text-[14px] font-bold text-white"
      >
        Entendi
      </button>
    </BottomSheet>
  );
}
