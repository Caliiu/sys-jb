'use client';

import type { PrizesReport } from '@sysjb/contracts';
import { formatBrl, formatCents } from '@/lib/currency';
import { formatCalendarDate, formatDateTimeSeconds } from '@/lib/datetime';
import { groupByLottery, itemLine, prizesReceipt } from '@/lib/prizes-pdf';
import { ROUTES } from '@/lib/routes';
import ReceiptScreen, { receiptRow as row } from '../receipt/ReceiptScreen';

interface PrizesScreenProps {
  report: PrizesReport;
  /** Vendedor = o próprio jogador (displayId). */
  sellerId: number;
  nowIso: string;
}

/** Premiadas > Consultar premiadas > data: pules premiadas do jogador no dia, por extração, e o total. */
export default function PrizesScreen({ report, sellerId, nowIso }: PrizesScreenProps) {
  const groups = groupByLottery(report.tickets);

  return (
    <ReceiptScreen
      title="Premiadas"
      back={{ href: ROUTES.prizesCheck, label: 'Voltar para as datas' }}
      receipt={prizesReceipt(report, sellerId, formatDateTimeSeconds(nowIso))}
    >
      {groups.length === 0 ? (
        <p className={row}>Nenhuma pule premiada</p>
      ) : (
        <>
          <p className={row}>
            <span>Premiadas</span>
            <span className="tabular-nums">{formatCalendarDate(report.date)}</span>
          </p>
          {groups.map((group) => (
            <section key={`${group.lottery}|${group.tickets[0]!.hour}`} aria-label={group.lottery}>
              <h2 className={`${row} font-normal`}>{group.lottery}</h2>
              <ul>
                {group.tickets.map((ticket) => (
                  <li key={ticket.puleNumber} className="px-3 py-3 border-b border-gray-200 space-y-1.5">
                    <p>Pule #{ticket.puleNumber}</p>
                    {ticket.items.map((item, i) => (
                      <div key={i} className="space-y-1.5">
                        <p className="flex justify-between gap-3 tabular-nums">
                          <span className="whitespace-pre">{itemLine(item.label, item.amountCents)}</span>
                          <span>{formatCents(item.prizeCents)}</span>
                        </p>
                        <p className="tabular-nums">{item.guesses.join(' ')}</p>
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className={row}>
            <span>Total P.</span>
            <span className="tabular-nums">{formatBrl(report.totalPrizeCents)}</span>
          </p>
        </>
      )}
    </ReceiptScreen>
  );
}
