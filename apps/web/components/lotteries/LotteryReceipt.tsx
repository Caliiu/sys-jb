'use client';

import { LOTTERY_GAME_LABELS, type PlaceLotteryTicketsResponse, type PublicWallet } from '@sysjb/contracts';
import { FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatBrl } from '@/lib/currency';
import { splitLabel } from '@/lib/report-receipts';
import BalancePill from '../fazendinha/BalancePill';
import SectionBar from '../section/SectionBar';
import { useToast } from '../ui/Toast';
import TicketCard from './TicketCard';

interface LotteryReceiptProps {
  receipt: PlaceLotteryTicketsResponse;
  wallet: PublicWallet;
  /** Botão de baixo (laranja) e o voltar da barra: "Nova aposta" na compra, "Menu" no Repetir pule. */
  exitLabel: string;
  onExit: () => void;
  /** Avisos sobre o recibo (ex.: "Aposta realizada com sucesso"). */
  children?: ReactNode;
}

/** Recibo de uma compra de Loterias (um cartão por pule), com Compartilhar e a saída. */
export default function LotteryReceipt({ receipt, wallet, exitLabel, onExit, children }: LotteryReceiptProps) {
  const toast = useToast();

  async function share() {
    const text = receipt.tickets
      .map((t) =>
        [
          `${t.lottery} #${t.puleNumber}`,
          ...t.items.map(
            (i) => `${i.modalityLabel} ${i.placementLabel}: ${i.guesses.join(' ')} (${formatBrl(i.totalCents)})`,
          ),
          `TOTAL: ${formatBrl(t.totalCents)}`,
        ].join('\n'),
      )
      .join('\n\n');
    try {
      if (navigator.share) return void (await navigator.share({ title: 'Recibo da aposta', text }));
      await navigator.clipboard.writeText(text);
      toast.show('Recibo copiado.');
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) toast.show('Não foi possível compartilhar.');
    }
  }

  return (
    <>
      <SectionBar
        title="Sucesso"
        tone="success"
        back={{ onClick: onExit, label: exitLabel }}
        trailing={<BalancePill wallet={wallet} />}
      />
      <main className="px-2 py-3 pb-40 space-y-3">
        {receipt.tickets.map((t) => (
          <TicketCard
            key={t.puleNumber}
            heading="RECIBO DA APOSTA"
            sellerId={t.sellerId}
            stampIso={t.createdAt}
            drawDate={t.drawDate}
            quoteTable={t.quoteTable}
            gameLabel={LOTTERY_GAME_LABELS[t.game]}
            lottery={t.lottery}
            puleNumber={t.puleNumber}
            items={t.items.map((i) => ({
              title: `${i.modalityLabel} ${i.placementLabel}`,
              guesses: i.guesses,
              amountCents: i.amountCents,
              splitLabel: splitLabel(i.split),
              possiblePrizeCents: i.possiblePrizeCents,
            }))}
            totalCents={t.totalCents}
          />
        ))}
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-[480px] space-y-2 bg-[#F4F6F6] px-2 pt-3 pb-3">
        <button
          type="button"
          onClick={share}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand-green text-[17px] font-bold text-white"
        >
          <FileText className="w-5 h-5" aria-hidden />
          Compartilhar
        </button>
        <button
          type="button"
          onClick={onExit}
          className="h-14 w-full rounded-xl bg-brand-orange text-[17px] font-bold text-white"
        >
          {exitLabel}
        </button>
      </div>
      {children}
    </>
  );
}
