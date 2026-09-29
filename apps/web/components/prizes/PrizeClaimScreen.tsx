'use client';

import type { PrizeClaim } from '@sysjb/contracts';
import { formatDateTimeSeconds } from '@/lib/datetime';
import { claimMessage, claimReceipt } from '@/lib/prizes-pdf';
import { ROUTES } from '@/lib/routes';
import ReceiptScreen, { receiptRow } from '../receipt/ReceiptScreen';

interface PrizeClaimScreenProps {
  claim: PrizeClaim;
  /** Vendedor = o próprio jogador (displayId). */
  sellerId: number;
  nowIso: string;
}

/** Premiadas > Reclame > resultado: se o prêmio da pule foi pago (e quando) ou não foi encontrado. */
export default function PrizeClaimScreen({ claim, sellerId, nowIso }: PrizeClaimScreenProps) {
  return (
    <ReceiptScreen
      title="Premiadas"
      back={{ href: ROUTES.prizeClaim, label: 'Consultar outra pule' }}
      receipt={claimReceipt(claim, sellerId, formatDateTimeSeconds(nowIso))}
    >
      <p className={receiptRow}>{claimMessage(claim)}</p>
    </ReceiptScreen>
  );
}
