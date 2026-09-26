'use client';

import { useId } from 'react';
import { formatBrl } from '@/lib/currency';
import { formatShortDateTime } from '@/lib/datetime';
import { pixKeyDisplay } from '@/lib/pix-key';
import type { WithdrawalItem } from '@/lib/withdrawal';
import BottomSheet from './BottomSheet';
import DetailRows from './DetailRows';
import WithdrawalStatusBadge from './WithdrawalStatusBadge';

interface WithdrawalDetailsSheetProps {
  /** Saque aberto; null = fechado. */
  item: WithdrawalItem | null;
  holderName: string;
  onClose: () => void;
}

/** "Detalhes do resgate": valor, status, titular, chave e data do saque escolhido na lista. */
export default function WithdrawalDetailsSheet({ item, holderName, onClose }: WithdrawalDetailsSheetProps) {
  const titleId = useId();

  return (
    <BottomSheet open={item !== null} onClose={onClose} titleId={titleId}>
      {item && (
        <>
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">
              Detalhes do resgate
            </h2>
            <WithdrawalStatusBadge status={item.status} />
          </div>

          <p className="mt-3 text-[26px] font-extrabold tabular-nums text-gray-900">{formatBrl(item.amountCents)}</p>

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

          <button
            type="button"
            onClick={onClose}
            className="mt-4 flex h-11 w-full items-center justify-center text-[14px] text-gray-500"
          >
            Fechar
          </button>
        </>
      )}
    </BottomSheet>
  );
}
