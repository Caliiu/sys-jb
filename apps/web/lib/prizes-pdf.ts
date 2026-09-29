import type { PrizeClaim, PrizeTicket, PrizesReport } from '@sysjb/contracts';
import { formatBrl, formatCents } from './currency';
import { formatCalendarDate, formatShortCalendarDate } from './datetime';
import type { ReceiptPdfContent, ReceiptSection } from './receipt-pdf';

/** Pules agrupadas pela extração, na ordem em que vieram (hora da extração e número do pule). */
export function groupByLottery(tickets: readonly PrizeTicket[]): Array<{ lottery: string; tickets: PrizeTicket[] }> {
  const groups = new Map<string, PrizeTicket[]>();
  for (const ticket of tickets) {
    const key = `${ticket.lottery}|${ticket.hour}`;
    const group = groups.get(key);
    if (group) group.push(ticket);
    else groups.set(key, [ticket]);
  }
  return [...groups.values()].map((group) => ({ lottery: group[0]!.lottery, tickets: group }));
}

/** "FZG1 1/1  1,00": modalidade/colocação e o valor apostado, como no comprovante. */
export const itemLine = (label: string, amountCents: number) => `${label}  ${formatCents(amountCents)}`;

/** Comprovante das premiadas do dia (Premiadas > Consultar premiadas > Compartilhar): o mesmo conteúdo da tela. */
export function prizesReceipt(report: PrizesReport, sellerId: number, consultedAt: string): ReceiptPdfContent {
  const base = { title: 'Premiadas', sellerId, consultedAt };
  if (report.tickets.length === 0) return { ...base, sections: [[{ left: 'Nenhuma pule premiada' }]] };

  const sections: ReceiptSection[] = [[{ left: 'Premiadas', right: formatCalendarDate(report.date) }]];
  for (const group of groupByLottery(report.tickets)) {
    sections.push([{ left: group.lottery }]);
    for (const ticket of group.tickets) {
      sections.push([
        { left: `Pule #${ticket.puleNumber}` },
        ...ticket.items.flatMap((item) => [
          { left: itemLine(item.label, item.amountCents), right: formatCents(item.prizeCents) },
          { left: item.guesses.join(' ') },
        ]),
      ]);
    }
  }
  sections.push([{ left: 'Total P.', right: formatBrl(report.totalPrizeCents) }]);
  return { ...base, sections };
}

/** Resposta do Reclame: "Prêmio pago em 28/09/26" ou "Prêmio não encontrado". */
export const claimMessage = (claim: PrizeClaim) =>
  claim.status === 'paid' ? `Prêmio pago em ${formatShortCalendarDate(claim.paidOn)}` : 'Prêmio não encontrado';

/** Comprovante do Reclame (Compartilhar): a mesma mensagem da tela. */
export function claimReceipt(claim: PrizeClaim, sellerId: number, consultedAt: string): ReceiptPdfContent {
  return { title: 'Reclame', sellerId, consultedAt, sections: [[{ left: claimMessage(claim) }]] };
}
