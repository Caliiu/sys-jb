'use client';

import type { PublicFazendinhaBet } from '@sysjb/contracts';
import { FileText } from 'lucide-react';
import { formatBrl } from '@/lib/currency';
import { formatBirthDate } from '@/lib/datetime';
import { MODE_CODE, lotteryLabel, palpiteLabel } from '@/lib/fazendinha';
import TenantLogo from '../tenant/TenantLogo';
import { useToast } from '../ui/Toast';

// Hora da venda com segundos, no fuso de Brasília: "28/09/2026 9:01:14".
const SOLD_AT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

const FOOTER = 'PULE DA FAZENDINHA NÃO PODE SER CANCELADA. BOA SORTE!';

interface BetReceiptProps {
  bet: PublicFazendinhaBet;
  onNewBet: () => void;
}

/** Comprovante (pule) da compra concluída. */
export default function BetReceipt({ bet, onNewBet }: BetReceiptProps) {
  const toast = useToast();
  const soldAt = SOLD_AT.format(new Date(bet.createdAt)).replace(', ', ' ');
  const lottery = lotteryLabel({ name: bet.lottery });
  const numbers = bet.numbers.map((n) => palpiteLabel(bet.mode, n));

  const shareText = [
    'FAZENDINHA',
    `VALE ${formatBirthDate(bet.drawDate)}`,
    `${lottery} #${bet.puleNumber}`,
    `FAZENDINHA ${MODE_CODE[bet.mode]}: ${numbers.join(' ')}`,
    `${formatBrl(bet.stakeCents)} / CADA`,
    `TOTAL JOGO: ${formatBrl(bet.totalCents)}`,
    `VENDEDOR: ${bet.sellerId} · ${soldAt}`,
  ].join('\n');

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: `Pule #${bet.puleNumber}`, text: shareText });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      toast.show('Comprovante copiado.');
    } catch (err) {
      // Cancelar o compartilhamento não é erro.
      if (!(err instanceof DOMException && err.name === 'AbortError')) toast.show('Não foi possível compartilhar.');
    }
  }

  const row = 'px-3 py-4 border-b border-gray-200';

  return (
    <>
      <main className="bg-white text-[15px] tracking-wide text-gray-900 uppercase">
        <div className="flex items-center justify-between gap-3 bg-brand-primary px-3 py-2 text-white">
          <TenantLogo size={36} className="w-9 h-9 rounded-full" />
          <div className="text-right text-[13px] leading-tight">
            <p className="font-bold">VENDEDOR: {bet.sellerId}</p>
            <p>{soldAt}</p>
          </div>
        </div>

        <h2 className={row}>FAZENDINHA</h2>

        <dl className={`${row} space-y-2`}>
          <div className="flex justify-between">
            <dt>VALE</dt>
            <dd>{formatBirthDate(bet.drawDate)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>COTAÇÃO</dt>
            <dd className="tabular-nums">{bet.quoteTable}</dd>
          </div>
        </dl>

        <p className={`${row} flex justify-between`}>
          <span>{lottery}</span>
          <span className="tabular-nums">#{bet.puleNumber}</span>
        </p>

        <div className={`${row} space-y-3`}>
          <p className="font-bold">FAZENDINHA {MODE_CODE[bet.mode]}</p>
          <p aria-label="Palpites" className="tabular-nums">
            {numbers.join('  ')}
          </p>
          <p>› {formatBrl(bet.stakeCents)} / CADA</p>
        </div>

        <p className={row}>TOTAL JOGO: {formatBrl(bet.totalCents)}</p>
        <p className={row}>{FOOTER}</p>
      </main>

      <div className="sticky bottom-0 bg-[#F4F6F6] px-2 pt-3 pb-3 space-y-2">
        <button
          type="button"
          onClick={share}
          className="w-full h-14 flex items-center justify-center gap-2 rounded-xl bg-brand-green text-white text-[17px] font-bold active:scale-[0.99] transition-transform"
        >
          <FileText className="w-5 h-5" aria-hidden />
          Compartilhar
        </button>
        <button
          type="button"
          onClick={onNewBet}
          className="w-full h-14 rounded-xl bg-brand-orange text-white text-[17px] font-bold active:scale-[0.99] transition-transform"
        >
          Nova aposta
        </button>
      </div>
    </>
  );
}
