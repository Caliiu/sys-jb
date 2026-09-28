'use client';

import { CircleCheck } from 'lucide-react';
import { useId, useRef } from 'react';
import { useOverlay } from '@/hooks/useOverlay';

/** "Aposta Realizada com sucesso" sobre o recibo. */
export default function SuccessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(open, onClose, panelRef);
  if (!open) return null;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-12">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-white px-4 pt-6 pb-4 text-center shadow-card"
      >
        <CircleCheck className="mx-auto w-16 h-16 text-green-500" strokeWidth={2.25} aria-hidden />
        <h2 id={titleId} className="mt-3 text-[16px] text-gray-900">
          Aposta Realizada com sucesso
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-12 w-full rounded-xl bg-brand-orange text-[16px] font-bold text-white"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
