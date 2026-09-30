import {
  type BalanceReport,
  LOTTERY_GAME_LABELS,
  type LotteryMovementReport,
  type LotterySplit,
  type PuleDetail,
} from '@sysjb/contracts';
import { formatBrl, formatCents } from './currency';
import { formatCalendarDate, formatShortCalendarDate } from './datetime';
import { MODE_CODE, palpiteLabel } from './fazendinha';
import type { ReceiptPdfContent, ReceiptSection } from './receipt-pdf';

// Conteúdo dos relatórios (Consultar saldo, Movimento loterias, recibo da pule): as mesmas seções montam a
// tela e o PDF de "Compartilhar", então os dois nunca divergem.

/** "7,00 (+)", "4,00 (-)"; com `currency`, "R$ 7,00 (+)". Zero conta como (+). */
export function signedCents(cents: number, currency = false): string {
  const value = currency ? formatBrl(Math.abs(cents)) : formatCents(Math.abs(cents));
  return `${value} (${cents < 0 ? '-' : '+'})`;
}

/** Relatórios > Consultar saldo. */
export function balanceSections(report: BalanceReport): ReceiptSection[] {
  const sections: ReceiptSection[] = [
    [{ left: 'Consulta saldo', right: formatCalendarDate(report.date) }],
    [
      { left: 'T.vendas:', right: formatCents(report.salesCents) },
      { left: 'Comissão:', right: formatCents(report.commissionCents) },
    ],
  ];
  if (report.prizes.length > 0) {
    sections.push(
      [{ left: 'Prêmios' }],
      report.prizes.map((prize) => ({ left: `P.# ${prize.puleNumber}`, right: formatCents(prize.amountCents) })),
    );
  }
  if (report.entries.length > 0) {
    sections.push(
      [{ left: 'Crédito / débitos' }],
      report.entries.map((entry) => ({ left: entry.label, right: signedCents(entry.amountCents) })),
    );
  }
  sections.push(
    [
      { left: 'Mandou:', right: `${formatCents(report.sentCents)} (+)` },
      { left: 'Recebeu:', right: `${formatCents(report.receivedCents)} (-)` },
      { left: 'Saldo ant.:', right: signedCents(report.previousCents, true) },
    ],
    [{ left: 'Haver:', right: signedCents(report.balanceCents, true) }],
  );
  return sections;
}

/** Relatórios > Movimento loterias. */
export function movementSections(report: LotteryMovementReport): ReceiptSection[] {
  if (report.rows.length === 0) return [[{ left: 'Não há movimento na data' }]];
  return [
    [{ left: 'Movimento loterias', right: formatCalendarDate(report.date) }],
    report.rows.map((row) => ({ left: row.code, right: formatCents(row.totalCents) })),
  ];
}

export const splitLabel = (split: LotterySplit) => (split === 'total' ? 'TODOS' : 'CADA');

/** Recibo da pule no formato do comprovante da compra (TicketCard). */
export interface PuleCard {
  sellerId: number;
  /** ISO 8601 da venda. */
  stampIso: string;
  drawDate: string;
  quoteTable: string;
  /** Loterias: "Tradicional 1/7" ou "Tradicional 1/10"; ausente na Fazendinha. */
  gameLabel?: string;
  lottery: string;
  puleNumber: number;
  items: Array<{
    title: string;
    guesses: string[];
    amountCents: number;
    splitLabel: string;
    /** Ausente na Fazendinha (o comprovante dela não mostra). */
    possiblePrizeCents?: number;
  }>;
  totalCents: number;
}

export function puleCard(detail: PuleDetail): PuleCard {
  if (detail.game === 'lotteries') {
    const { ticket } = detail;
    return {
      sellerId: ticket.sellerId,
      stampIso: ticket.createdAt,
      drawDate: ticket.drawDate,
      quoteTable: ticket.quoteTable,
      gameLabel: LOTTERY_GAME_LABELS[ticket.game],
      lottery: ticket.lottery,
      puleNumber: ticket.puleNumber,
      items: ticket.items.map((item) => ({
        title: `${item.modalityLabel} ${item.placementLabel}`,
        guesses: item.guesses,
        amountCents: item.amountCents,
        splitLabel: splitLabel(item.split),
        possiblePrizeCents: item.possiblePrizeCents,
      })),
      totalCents: ticket.totalCents,
    };
  }
  const { bet } = detail;
  return {
    sellerId: bet.sellerId,
    stampIso: bet.createdAt,
    drawDate: bet.drawDate,
    quoteTable: bet.quoteTable,
    lottery: bet.lottery,
    puleNumber: bet.puleNumber,
    items: [
      {
        // "FAZENDINHA GP-1": modalidade e valor por número em reais.
        title: `Fazendinha ${MODE_CODE[bet.mode]}-${formatCents(bet.stakeCents).replace(/,00$/, '')}`,
        guesses: bet.numbers.map((n) => palpiteLabel(bet.mode, n)),
        amountCents: bet.stakeCents,
        splitLabel: 'CADA',
      },
    ],
    totalCents: bet.totalCents,
  };
}

/** PDF do recibo: o mesmo conteúdo do TicketCard, com a data/hora da venda no topo. */
export function puleReceipt(card: PuleCard, stamp: string): ReceiptPdfContent {
  return {
    title: `Pule #${card.puleNumber}`,
    sellerId: card.sellerId,
    consultedAt: stamp,
    sections: [
      [{ left: 'Recibo da aposta' }],
      [
        { left: 'Vale', right: formatShortCalendarDate(card.drawDate) },
        { left: 'Cotação', right: card.quoteTable },
        ...(card.gameLabel ? [{ left: 'Jogo', right: card.gameLabel }] : []),
      ],
      [{ left: card.lottery, right: `#${card.puleNumber}` }],
      ...card.items.map((item) => [
        { left: [{ text: item.title, bold: true }] },
        { left: item.guesses.join('  ') },
        { left: `> ${formatBrl(item.amountCents)} / ${item.splitLabel}` },
        ...(item.possiblePrizeCents === undefined
          ? []
          : [{ left: `> Possível prêmio: ${formatBrl(item.possiblePrizeCents)}` }]),
      ]),
      [{ left: 'Total jogo:', right: formatBrl(card.totalCents) }],
      [{ left: 'A pagar', right: formatBrl(card.totalCents) }],
      [{ left: [{ text: 'Confira sua aposta. Boa sorte!', bold: true }] }],
    ],
  };
}
