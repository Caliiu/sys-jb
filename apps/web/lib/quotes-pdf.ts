import type { ReceiptPdfContent } from './receipt-pdf';

export interface QuotesReceiptInput {
  sellerId: number;
  /** "28/09/2026 19:34:36" */
  consultedAt: string;
  tableLabel: string;
  /** "R$1,00" */
  valuePerUnit: string;
  /** Aviso do Duque GP / Terno GP (só no Tradicional). */
  dryBetNote: boolean;
  rows: Array<{ label: string; value: string }>;
}

/** Comprovante da tabela de cotações (Relatórios > Cotações > Compartilhar): o mesmo conteúdo da tela. */
export function quotesReceipt(input: QuotesReceiptInput): ReceiptPdfContent {
  return {
    title: 'Tabela de cotação',
    sellerId: input.sellerId,
    consultedAt: input.consultedAt,
    sections: [
      [
        { left: 'Tabela de cotação', right: input.tableLabel },
        { left: 'Valor pra cada', right: input.valuePerUnit },
      ],
      ...(input.dryBetNote
        ? [
            [
              {
                left: [
                  { text: 'Para ' },
                  { text: 'Duque GP', bold: true },
                  { text: ' e ' },
                  { text: 'Terno GP', bold: true },
                ],
              },
              { left: 'Valor válido para aposta seca' },
            ],
          ]
        : []),
      ...input.rows.map((row) => [{ left: row.label, right: row.value }]),
    ],
  };
}
