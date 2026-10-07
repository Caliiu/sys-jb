'use client';

import type { PuleDetail } from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cancelPuleAction } from '@/app/pule-actions';
import { useSecondsUntil } from '@/hooks/useCountdown';
import { openReceiptPdf } from '@/lib/receipt-pdf';
import { puleCard, puleReceipt } from '@/lib/report-receipts';
import { ROUTES } from '@/lib/routes';
import TicketCard, { ticketStamp } from '../lotteries/TicketCard';
import ReceiptActions from '../receipt/ReceiptActions';
import SectionBar from '../section/SectionBar';
import { useTenant } from '../tenant/TenantProvider';
import type { BackAction } from '../ui/BackButton';
import { useToast } from '../ui/Toast';
import CancelPuleSheet from './CancelPuleSheet';

interface PuleReceiptScreenProps {
  detail: PuleDetail;
  back: BackAction;
}

/** "m:ss" do prazo que falta para cancelar. */
const minutesLeft = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Relatórios > Consultar pule: recibo da aposta (o mesmo da compra), com Compartilhar (PDF) e, para pule de
 * Loterias ainda no prazo (os primeiros minutos depois da aposta, antes do horário de venda), Cancelar pule com
 * confirmação e o tempo que resta. A API confere o prazo de novo; passado o prazo, o botão some sozinho.
 */
export default function PuleReceiptScreen({ detail: initial, back }: PuleReceiptScreenProps) {
  const tenant = useTenant();
  const toast = useToast();
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = puleCard(detail);
  const until = detail.game === 'lotteries' ? detail.cancellableUntil : null;
  // null até o relógio do navegador começar (sem divergência com o servidor).
  const secondsLeft = useSecondsUntil(until ?? new Date(0).toISOString());
  const canCancel = detail.game === 'lotteries' && detail.cancellable && until !== null && secondsLeft !== 0;

  async function confirmCancel() {
    if (pending || detail.game !== 'lotteries') return;
    setPending(true);
    setError(null);
    try {
      const result = await cancelPuleAction(detail.ticket.puleNumber);
      if (result.ok) {
        setDetail(result.detail);
        setConfirming(false);
        toast.show('Pule cancelada. O valor voltou para a sua carteira.');
      } else if (result.code === 'SESSION_INVALID') {
        router.replace('/login');
      } else {
        setError(result.message);
      }
    } catch {
      setError('Não foi possível cancelar agora. Tente novamente.');
    } finally {
      setPending(false);
    }
  }

  async function share() {
    if (!(await openReceiptPdf(tenant, puleReceipt(card, ticketStamp(card.stampIso))))) {
      toast.show('Não foi possível gerar o PDF.');
    }
  }

  return (
    <>
      <SectionBar title="Consultar pule" back={back} />
      <main className="flex-1 px-2 py-3">
        <TicketCard heading="RECIBO DA APOSTA" lookup {...card} />
      </main>
      <ReceiptActions onShare={share} exit={{ href: ROUTES.reports, label: 'Menu' }}>
        {canCancel && (
          <div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
              className="w-full h-14 rounded-xl bg-red-500 text-white text-[17px] font-bold active:scale-[0.99] transition-transform"
            >
              Cancelar pule
            </button>
            {secondsLeft !== null && (
              <p className="mt-1.5 text-center text-[12.5px] text-gray-500">
                Você pode cancelar por mais{' '}
                <span className="font-semibold tabular-nums">{minutesLeft(secondsLeft)}</span>
              </p>
            )}
          </div>
        )}
      </ReceiptActions>
      {detail.game === 'lotteries' && (
        <CancelPuleSheet
          open={confirming && canCancel}
          puleNumber={detail.ticket.puleNumber}
          totalCents={detail.ticket.totalCents}
          pending={pending}
          error={error}
          onConfirm={() => void confirmCancel()}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
