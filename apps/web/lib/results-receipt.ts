import { formatCalendarDate } from './datetime';
import type { ReceiptPdfContent, ReceiptSection } from './receipt-pdf';
import { resultPrizeParts } from './result-format';

/** Extração escolhida pelo jogador que já tem resultado: nome do sorteio da banca e os prêmios (1º em diante). */
export interface DrawResult {
  drawName: string;
  prizes: string[];
}

export interface ResultsReceiptInput {
  /** YYYY-MM-DD. */
  date: string;
  results: DrawResult[];
  sellerId: number;
  /** "30/09/2026 09:34:40" */
  consultedAt: string;
}

/** Aviso quando nenhuma das extrações escolhidas tem resultado no dia. */
export const NO_RESULTS_TEXT = 'Não há resultado na data';

/**
 * Comprovante de Resultados > Resultado loterias: "Resultados" e a data; um bloco por extração ("› LT PT RIO 09HS"
 * e "1: 7.977 G.20 ... PERU"). O mesmo conteúdo na tela e no PDF de "Compartilhar".
 */
export function resultsReceipt(input: ResultsReceiptInput): ReceiptPdfContent {
  const draws: ReceiptSection[] = input.results.map((result) => [
    { left: [{ text: '› ' }, { text: result.drawName, bold: true }] },
    ...result.prizes.map((number, index) => {
      const prize = resultPrizeParts(number);
      return {
        left: [{ text: `${index + 1}: ` }, { text: prize.number, bold: true }],
        right: prize.bicho,
        rightBold: true,
      };
    }),
  ]);
  return {
    title: 'Resultados',
    sellerId: input.sellerId,
    consultedAt: input.consultedAt,
    sections: [
      [{ left: 'Resultados', right: formatCalendarDate(input.date) }],
      ...(draws.length > 0 ? draws : [[{ left: NO_RESULTS_TEXT }]]),
    ],
  };
}
