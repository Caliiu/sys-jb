'use client';

import { CircleX } from 'lucide-react';
import { useId, useRef } from 'react';
import { useOverlay } from '@/hooks/useOverlay';

interface ErrorDialogProps {
  /** Mensagem do erro; null = fechado. */
  message: string | null;
  onClose: () => void;
}

/** Aviso de erro da compra ("Ocorreu um erro"): Esc, toque fora ou "Fechar" fecham. */
export default function ErrorDialog({ message, onClose }: ErrorDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useOverlay(message !== null, onClose, panelRef);

  if (message === null) return null;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-12">
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-white px-4 pt-5 pb-4 text-center shadow-card"
      >
        <CircleX className="w-16 h-16 mx-auto text-red-500" strokeWidth={2.25} aria-hidden />
        <h2 id={titleId} className="mt-3 text-[18px] font-bold text-gray-900">
          Ocorreu um erro
        </h2>
        <p id={descriptionId} className="mt-2 text-[15px] text-gray-500 uppercase">
          {message}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-12 mt-5 rounded-lg bg-red-500 text-white text-[16px] font-bold active:scale-[0.99] transition-transform"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
