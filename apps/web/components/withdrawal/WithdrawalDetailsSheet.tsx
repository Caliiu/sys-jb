'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { cancelWithdrawalAction } from '@/app/withdrawal-actions';
import { formatBrl } from '@/lib/currency';
import { formatShortDateTime } from '@/lib/datetime';
import { pixKeyDisplay } from '@/lib/pix-key';
import { WITHDRAWAL_STATUS_HINTS, type WithdrawalItem } from '@/lib/withdrawal';
import BottomSheet from '../ui/BottomSheet';
import DetailRows from './DetailRows';
import WithdrawalStatusBadge from './WithdrawalStatusBadge';

interface WithdrawalDetailsSheetProps {
  /** Saque aberto; null = fechado. */
  item: WithdrawalItem | null;
  holderName: string;
  onClose: () => void;
  /** O saque mudou (cancelado): a lista busca de novo no servidor. */
  onChanged: () => void;
}

/**
 * "Detalhes do resgate": valor, status (com o que ele significa), titular, chave e data. Em análise, dá para cancelar
 * (pede confirmação; o servidor confere de novo e devolve o valor aos prêmios). Recusado mostra o motivo da banca.
 */
export default function WithdrawalDetailsSheet({ item, holderName, onClose, onChanged }: WithdrawalDetailsSheetProps) {
  const titleId = useId();
  const router = useRouter();
  const [canceling, setCanceling] = useState(false);
  // Erro do cancelamento, de qual saque (outro saque aberto não mostra o erro do anterior).
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const error = item && failure?.id === item.id ? failure.message : null;

  async function cancel() {
    if (!item || canceling) return;
    if (
      !window.confirm(`Cancelar o saque de ${formatBrl(item.amountCents)}? O valor volta para o seu saldo de prêmios.`)
    ) {
      return;
    }
    const id = item.id;
    setCanceling(true);
    setFailure(null);
    try {
      const result = await cancelWithdrawalAction(id);
      if (result.ok) onChanged();
      else if (result.code === 'SESSION_INVALID') router.replace('/login');
      else setFailure({ id, message: result.message });
    } catch {
      setFailure({ id, message: 'Não foi possível cancelar. Tente novamente.' });
    } finally {
      setCanceling(false);
    }
  }

  return (
    <BottomSheet open={item !== null} onClose={onClose} titleId={titleId} dismissible={!canceling}>
      {item && (
        <>
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">
              Detalhes do resgate
            </h2>
            <WithdrawalStatusBadge status={item.status} />
          </div>

          <p className="mt-3 text-[26px] font-extrabold tabular-nums text-gray-900">{formatBrl(item.amountCents)}</p>
          <p className="mt-1 text-[13px] text-gray-500">{WITHDRAWAL_STATUS_HINTS[item.status]}</p>
          {item.note && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">Motivo: {item.note}</p>
          )}

          <div className="mt-4">
            <DetailRows
              rows={[
                { label: 'Forma', value: 'Pix' },
                { label: 'Titular', value: <span className="uppercase">{holderName}</span> },
                { label: 'Chave Pix', value: pixKeyDisplay(item.keyType, item.keyValue) },
                { label: 'Data', value: formatShortDateTime(item.createdAt) },
              ]}
            />
          </div>

          {error && (
            <p role="alert" className="mt-3 text-center text-[13px] font-semibold text-red-700">
              {error}
            </p>
          )}

          {item.cancellable && (
            <button
              type="button"
              onClick={() => void cancel()}
              disabled={canceling}
              className="mt-4 flex h-11 w-full items-center justify-center rounded-xl border border-red-200 text-[14px] font-semibold text-red-700 disabled:opacity-60"
            >
              {canceling ? 'Cancelando…' : 'Cancelar saque'}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            disabled={canceling}
            className="mt-2 flex h-11 w-full items-center justify-center text-[14px] text-gray-500"
          >
            Fechar
          </button>
        </>
      )}
    </BottomSheet>
  );
}
