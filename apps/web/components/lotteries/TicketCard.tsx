'use client';

import { ChevronRight } from 'lucide-react';
import { formatBrl, formatCents } from '@/lib/currency';
import { formatBirthDate } from '@/lib/datetime';
import TenantLogo from '../tenant/TenantLogo';

// Data e hora no fuso de Brasília: "28/09/26 12:04:53".
const STAMP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
export const ticketStamp = (iso: string) => STAMP.format(new Date(iso)).replace(', ', ' ');

export interface TicketCardItem {
  title: string;
  guesses: string[];
  amountCents: number;
  splitLabel: string;
  possiblePrizeCents: number;
}

interface TicketCardProps {
  heading: 'RESUMO DA APOSTA' | 'RECIBO DA APOSTA';
  sellerId: number;
  /** ISO 8601 do resumo (agora) ou da compra. */
  stampIso: string;
  drawDate: string;
  quoteTable: string;
  lottery: string;
  puleNumber?: number;
  items: TicketCardItem[];
  totalCents: number;
}

const row = 'border-b border-dashed border-gray-300 py-3';

/** Pule no formato do comprovante (resumo antes de finalizar; recibo depois, com o número). */
export default function TicketCard(props: TicketCardProps) {
  const { heading, sellerId, stampIso, drawDate, quoteTable, lottery, puleNumber, items, totalCents } = props;
  return (
    <article
      aria-label={`${heading === 'RECIBO DA APOSTA' ? 'Recibo' : 'Resumo'} ${lottery}`}
      className="overflow-hidden rounded-xl bg-white text-[14px] tracking-wide text-gray-900 uppercase shadow-card"
    >
      <div className="flex items-center justify-between gap-3 bg-brand-primary px-3 py-2 text-white">
        <TenantLogo size={36} className="w-9 h-9 rounded-full" />
        <div className="text-right text-[13px] leading-tight">
          <p className="font-bold">VENDEDOR: {sellerId}</p>
          <p className="tabular-nums">{ticketStamp(stampIso)}</p>
        </div>
      </div>
      <div className="px-3 pb-3">
        <p className="flex items-center gap-3 py-3 text-[13px] text-gray-600 before:h-px before:flex-1 before:border-t before:border-dashed before:border-gray-300 after:h-px after:flex-1 after:border-t after:border-dashed after:border-gray-300">
          {heading}
        </p>
        <dl className={`${row} space-y-1`}>
          <div className="flex justify-between">
            <dt>Vale</dt>
            <dd className="font-bold tabular-nums">{formatBirthDate(drawDate)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Cotação</dt>
            <dd className="font-bold tabular-nums">{quoteTable}</dd>
          </div>
        </dl>
        <p className={`${row} flex justify-between`}>
          <span>{lottery}</span>
          {puleNumber !== undefined && <span className="font-bold tabular-nums">#{puleNumber}</span>}
        </p>
        {items.map((item, i) => (
          <div key={i} className={`${row} space-y-2`}>
            <p className="font-bold">{item.title}</p>
            <ul className="flex flex-wrap gap-2 normal-case">
              {item.guesses.map((guess) => (
                <li key={guess} className="rounded-md bg-gray-100 px-2.5 py-1 font-bold tabular-nums">
                  {guess}
                </li>
              ))}
            </ul>
            <p className="flex items-center gap-1 font-bold tabular-nums">
              <ChevronRight className="w-4 h-4" aria-hidden />
              {formatCents(item.amountCents)} / {item.splitLabel}
            </p>
            <p className="flex items-center gap-1 text-gray-600 tabular-nums">
              <ChevronRight className="w-4 h-4" aria-hidden />
              Possível prêmio: {formatBrl(item.possiblePrizeCents)}
            </p>
          </div>
        ))}
        <p className={`${row} flex justify-between`}>
          <span>Total jogo:</span>
          <span className="font-bold tabular-nums">{formatBrl(totalCents)}</span>
        </p>
        <p className={`${row} flex justify-between`}>
          <span>A pagar</span>
          <span className="font-bold tabular-nums">{formatBrl(totalCents)}</span>
        </p>
        {heading === 'RECIBO DA APOSTA' && <p className="pt-3 font-bold">Confira sua aposta. Boa sorte!</p>}
      </div>
    </article>
  );
}
