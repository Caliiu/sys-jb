'use client';

import { CircleAlert } from 'lucide-react';
import { useId } from 'react';
import BottomSheet from '../ui/BottomSheet';

interface ExplainSheetProps {
  open: boolean;
  onClose: () => void;
}

/** "Entenda": só prêmios podem ser resgatados (recarga e bônus não) e como o saldo é usado nas apostas. */
export default function ExplainSheet({ open, onClose }: ExplainSheetProps) {
  const titleId = useId();

  return (
    <BottomSheet open={open} onClose={onClose} titleId={titleId}>
      <h2 id={titleId} className="flex items-center gap-2 text-[15px] font-bold text-brand-orangeDark">
        <CircleAlert className="h-5 w-5 shrink-0" aria-hidden />
        Só prêmios podem ser resgatados
      </h2>
      <p className="mt-2 text-[14px] text-gray-800">
        Recargas e bônus servem para jogar e não podem ser sacados. Prêmios das loterias e ganhos do cassino podem.
      </p>

      <h3 className="mt-5 text-[15px] font-bold text-gray-900">Uso do saldo nas apostas</h3>
      <p className="mt-2 text-[14px] text-gray-800">
        <span className="whitespace-nowrap">1º Saldo livre</span> <span aria-hidden>›</span>
        <span className="sr-only">, depois</span> <span className="whitespace-nowrap">2º Saldo recarga</span>{' '}
        <span aria-hidden>›</span>
        <span className="sr-only">, depois</span> <span className="whitespace-nowrap">3º Bônus</span>
      </p>

      <h3 className="mt-5 text-[15px] font-bold text-gray-900">Disponível para saque</h3>
      <p className="mt-2 text-[14px] text-gray-800">
        Prêmios das loterias <span aria-hidden>( + )</span>
        <span className="sr-only"> mais </span> Ganhos do cassino
      </p>
      <p className="mt-2 text-[13px] text-gray-500">
        O valor do saque sai na hora do pedido e volta para os prêmios se o saque for cancelado, recusado ou não pago.
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
