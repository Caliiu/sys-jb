'use client';

import { Check } from 'lucide-react';
import { type CSSProperties, useEffect, useId, useRef } from 'react';
import { useOverlay } from '@/hooks/useOverlay';

/** Quanto o aviso fica na tela antes de abrir o recibo. */
export const REPEAT_REDIRECT_MS = 1500;

/**
 * "Pule repetida com sucesso! Direcionando ao recibo…": a barra enche e, ao terminar, `onDone` abre o recibo.
 * Não fecha por Esc nem por toque fora (a compra já foi feita; o próximo passo é sempre o recibo).
 */
export default function RepeatSuccessDialog({ open, onDone }: { open: boolean; onDone: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useOverlay(open, () => {}, panelRef, 'panel');

  // A última versão do callback, sem reiniciar o tempo se o pai renderizar de novo.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => done.current(), REPEAT_REDIRECT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-12">
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-white px-6 pt-6 pb-6 text-center shadow-card outline-none"
      >
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-green-500">
            <Check className="h-6 w-6 text-white" strokeWidth={3} aria-hidden />
          </span>
        </span>
        <h2 id={titleId} className="mt-4 text-[18px] font-bold text-gray-900">
          Pule repetida com sucesso!
        </h2>
        <p id={descriptionId} className="mt-1 text-[14px] text-gray-400">
          Direcionando ao recibo...
        </p>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-red-100" aria-hidden>
          <div
            style={{ '--fill-duration': `${REPEAT_REDIRECT_MS}ms` } as CSSProperties}
            className="h-full origin-left animate-fill rounded-full bg-brand-primary"
          />
        </div>
      </div>
    </div>
  );
}
