'use client';

import { CircleHelp } from 'lucide-react';
import { useId, useRef } from 'react';
import { useOverlay } from '@/hooks/useOverlay';

interface ConfirmPurchaseDialogProps {
  open: boolean;
  /** Quantidade de palpites (números) a comprar. */
  count: number;
  /** Compra em andamento: botões travados. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmação antes de comprar os palpites: Esc ou toque fora cancelam. */
export default function ConfirmPurchaseDialog({
  open,
  count,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmPurchaseDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useOverlay(open, onCancel, panelRef);

  if (!open) return null;

  return (
    <div onClick={onCancel} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-12">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-white px-4 pt-5 pb-3 text-center shadow-card"
      >
        <CircleHelp className="w-14 h-14 mx-auto text-brand-primary" strokeWidth={2.25} aria-hidden />
        <h2 id={titleId} className="mt-3 text-[18px] font-bold text-gray-900">
          Confirmar compra
        </h2>
        <p id={descriptionId} className="mt-2 text-[15px] text-gray-500">
          Confirma a compra de {count} {count === 1 ? 'número' : 'números'} para fazendinha?
        </p>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="w-full h-12 mt-5 rounded-lg bg-brand-orange text-white text-[16px] font-bold active:scale-[0.99] transition-transform disabled:opacity-70"
        >
          {pending ? 'Aguarde…' : 'Confirmar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="w-full h-11 mt-1 text-[15px] text-gray-800 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
