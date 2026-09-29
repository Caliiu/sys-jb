'use client';

import { CircleX, CircleAlert } from 'lucide-react';
import { useId, useRef } from 'react';
import { useOverlay } from '@/hooks/useOverlay';

interface ErrorDialogProps {
  /** Mensagem do erro; null = fechado. */
  message: string | null;
  onClose: () => void;
  /** Padrão: "Ocorreu um erro". */
  title?: string;
  /** Padrão: "Fechar". */
  actionLabel?: string;
  /**
   * `compact` (padrão): X vermelho e botão sólido (compra da Fazendinha e das Loterias).
   * `soft`: "!" num halo e botão em degradê da banca (Repetir pule).
   */
  variant?: 'compact' | 'soft';
}

/** Aviso de erro ("Ocorreu um erro"): Esc, toque fora ou o botão fecham. */
export default function ErrorDialog({
  message,
  onClose,
  title = 'Ocorreu um erro',
  actionLabel = 'Fechar',
  variant = 'compact',
}: ErrorDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useOverlay(message !== null, onClose, panelRef);

  if (message === null) return null;
  const soft = variant === 'soft';

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-12">
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
        className={`w-full max-w-sm bg-white text-center shadow-card ${
          soft ? 'rounded-2xl px-6 pt-6 pb-6' : 'rounded-xl px-4 pt-5 pb-4'
        }`}
      >
        {soft ? (
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-primary">
              <CircleAlert className="h-5 w-5 text-white" strokeWidth={2.5} aria-hidden />
            </span>
          </span>
        ) : (
          <CircleX className="w-16 h-16 mx-auto text-red-500" strokeWidth={2.25} aria-hidden />
        )}
        <h2 id={titleId} className="mt-3 text-[18px] font-bold text-gray-900">
          {title}
        </h2>
        <p id={descriptionId} className={`uppercase text-gray-500 ${soft ? 'mt-1 text-[14px]' : 'mt-2 text-[15px]'}`}>
          {message}
        </p>
        <button
          type="button"
          onClick={onClose}
          className={`mt-5 w-full font-bold text-white transition-transform active:scale-[0.99] ${
            soft
              ? 'h-12 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primaryLight text-[16px] shadow-card'
              : 'h-12 rounded-lg bg-red-500 text-[16px]'
          }`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
