import { describe, expect, it } from 'vitest';
import { quotesReceipt } from './quotes-pdf';

const base = {
  sellerId: 100000,
  consultedAt: '28/09/2026 19:34:36',
  tableLabel: '800/1/8000',
  valuePerUnit: 'R$1,00',
  rows: [
    { label: 'GRUPO', value: 'R$ 20,00' },
    { label: 'MILHAR', value: 'R$ 8.000,00' },
  ],
};

describe('comprovante da tabela de cotações', () => {
  it('Tradicional: tabela, aviso do Duque/Terno GP e uma linha por modalidade', () => {
    const receipt = quotesReceipt({ ...base, dryBetNote: true });
    expect(receipt.title).toBe('Tabela de cotação');
    expect(receipt.sections).toEqual([
      [
        { left: 'Tabela de cotação', right: '800/1/8000' },
        { left: 'Valor pra cada', right: 'R$1,00' },
      ],
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
      [{ left: 'GRUPO', right: 'R$ 20,00' }],
      [{ left: 'MILHAR', right: 'R$ 8.000,00' }],
    ]);
  });

  it('Fazendinha: sem o aviso', () => {
    const receipt = quotesReceipt({ ...base, dryBetNote: false });
    expect(receipt.sections).toHaveLength(3);
    expect(JSON.stringify(receipt)).not.toContain('aposta seca');
  });
});
