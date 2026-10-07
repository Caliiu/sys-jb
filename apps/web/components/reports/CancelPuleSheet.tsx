'use client';

import { useId } from 'react';
import { formatBrl } from '@/lib/currency';
import BottomSheet from '../ui/BottomSheet';

interface CancelPuleSheetProps {
  open: boolean;
  puleNumber: number;
  totalCents: number;
  /** Cancelamento em andamento: bloqueia os botões e o fechamento (sem pedido duplicado). */
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** "Cancelar pule": confirmação antes de desfazer a aposta (o valor volta para as bolsas de onde saiu). */
export default function CancelPuleSheet({
  open,
  puleNumber,
  totalCents,
  pending,
  error,
  onConfirm,
  onClose,
}: CancelPuleSheetProps) {
  const titleId = useId();

  return (
    <BottomSheet open={open} onClose={onClose} titleId={titleId} dismissible={!pending}>
      <h2 id={titleId} className="text-[19px] font-extrabold text-gray-900">
        Cancelar pule #{puleNumber}?
      </h2>
      <p className="mt-1 text-[13.5px] text-gray-600">
        A aposta de <strong className="text-gray-900">{formatBrl(totalCents)}</strong> deixa de valer e o valor volta
        para a sua carteira. Isso não pode ser desfeito.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-center text-[13px] font-semibold text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className="mt-4 flex h-[50px] w-full items-center justify-center rounded-2xl bg-red-500 text-[15px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
      >
        {pending ? 'Cancelando…' : 'Cancelar pule'}
      </button>
      <button
        type="button"
        onClick={onClose}
        disabled={pending}
        className="mt-2 flex h-11 w-full items-center justify-center text-[14px] text-gray-500 disabled:opacity-60"
      >
        Voltar
      </button>
    </BottomSheet>
  );
}
