'use client';

import { useId } from 'react';
import { formatBrl } from '@/lib/currency';
import { PIX_KEY_INFO, type PixKeyType, pixKeyDisplay } from '@/lib/pix-key';
import BottomSheet from './BottomSheet';
import DetailRows from './DetailRows';

interface ConfirmWithdrawalSheetProps {
  open: boolean;
  amountCents: number;
  keyType: PixKeyType;
  /** Chave normalizada. */
  keyValue: string;
  /** Envio em andamento: bloqueia os botões e o fechamento (sem pedido duplicado). */
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** "Confirmar saque": última conferência dos dados antes de solicitar. */
export default function ConfirmWithdrawalSheet({
  open,
  amountCents,
  keyType,
  keyValue,
  pending,
  error,
  onConfirm,
  onCancel,
}: ConfirmWithdrawalSheetProps) {
  const titleId = useId();

  return (
    <BottomSheet open={open} onClose={onCancel} titleId={titleId} dismissible={!pending}>
      <h2 id={titleId} className="text-[19px] font-extrabold text-gray-900">
        Confirmar saque
      </h2>
      <p className="mt-1 text-[13px] text-gray-500">Confira os dados antes de solicitar.</p>

      <div className="mt-4">
        <DetailRows
          rows={[
            { label: 'Valor', value: formatBrl(amountCents), emphasis: true },
            { label: 'Forma', value: `Pix · ${PIX_KEY_INFO[keyType].label}` },
            { label: 'Destino', value: pixKeyDisplay(keyType, keyValue) },
          ]}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-center text-[13px] font-semibold text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className="mt-4 flex h-[50px] w-full items-center justify-center rounded-2xl bg-brand-primary text-[15px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
      >
        {pending ? 'Enviando…' : 'Confirmar saque'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="mt-2 flex h-11 w-full items-center justify-center text-[14px] text-gray-500 disabled:opacity-60"
      >
        Cancelar
      </button>
    </BottomSheet>
  );
}
