'use client';

import type { PuleDetail } from '@sysjb/contracts';
import { openReceiptPdf } from '@/lib/receipt-pdf';
import { puleCard, puleReceipt } from '@/lib/report-receipts';
import { ROUTES } from '@/lib/routes';
import TicketCard, { ticketStamp } from '../lotteries/TicketCard';
import ReceiptActions from '../receipt/ReceiptActions';
import SectionBar from '../section/SectionBar';
import { useTenant } from '../tenant/TenantProvider';
import type { BackAction } from '../ui/BackButton';
import { useToast } from '../ui/Toast';

interface PuleReceiptScreenProps {
  detail: PuleDetail;
  back: BackAction;
}

/**
 * Relatórios > Consultar pule: recibo da aposta (o mesmo da compra), com Compartilhar (PDF) e, para pule de
 * Loterias ainda dentro do horário de venda, Cancelar pule (o cancelamento em si ainda não existe).
 */
export default function PuleReceiptScreen({ detail, back }: PuleReceiptScreenProps) {
  const tenant = useTenant();
  const toast = useToast();
  const card = puleCard(detail);
  const canCancel = detail.game === 'lotteries' && detail.cancellable;

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
          <button
            type="button"
            onClick={() => toast.comingSoon('Cancelar pule')}
            className="w-full h-14 rounded-xl bg-red-500 text-white text-[17px] font-bold active:scale-[0.99] transition-transform"
          >
            Cancelar pule
          </button>
        )}
      </ReceiptActions>
    </>
  );
}
