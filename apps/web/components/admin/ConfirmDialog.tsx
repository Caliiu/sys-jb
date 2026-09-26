'use client';

import { useId, useRef } from 'react';
import { useOverlay } from '@/hooks/useOverlay';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** danger: ação destrutiva (ex.: bloquear). */
  tone?: 'primary' | 'danger';
  pending?: boolean;
  /** Erro da última tentativa, mostrado dentro do diálogo. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Diálogo de confirmação acessível: Esc cancela, o foco entra no painel e volta para quem abriu. */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useOverlay(open, () => !pending && onCancel(), panelRef);

  if (!open) return null;

  return (
    <div
      onClick={() => !pending && onCancel()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-admin-surface p-5 shadow-admin"
      >
        <h2 id={titleId} className="text-[15px] font-bold text-admin-text">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-[13px] text-admin-muted">
          {description}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-[12.5px] font-semibold text-admin-danger">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-admin-border px-4 py-2 text-[13px] font-semibold text-admin-text disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60 ${
              tone === 'danger' ? 'bg-admin-danger' : 'bg-admin-accent'
            }`}
          >
            {pending ? 'Aguarde…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
