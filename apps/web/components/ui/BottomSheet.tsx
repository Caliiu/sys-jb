'use client';

import { type ReactNode, useRef } from 'react';
import { useOverlay } from '@/hooks/useOverlay';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** id do título dentro do conteúdo (aria-labelledby). */
  titleId: string;
  /** false: Esc e toque fora não fecham (ex.: enquanto um envio está em andamento). */
  dismissible?: boolean;
  children: ReactNode;
}

/** Folha inferior acessível: Esc fecha, o foco entra no painel e volta para quem abriu, a página não rola. */
export default function BottomSheet({ open, onClose, titleId, dismissible = true, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => {
    if (dismissible) onClose();
  };
  useOverlay(open, close, panelRef);

  if (!open) return null;

  return (
    <div onClick={close} className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-2xl bg-white px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <span aria-hidden className="mx-auto mb-4 block h-1 w-10 rounded-full bg-gray-300" />
        {children}
      </div>
    </div>
  );
}
