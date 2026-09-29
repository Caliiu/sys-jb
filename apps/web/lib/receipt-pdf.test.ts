import { describe, expect, it } from 'vitest';
import { buildReceiptPdf, type ReceiptPdfInput, textWidth } from './receipt-pdf';

const input: ReceiptPdfInput = {
  title: 'Tabela de cotação',
  primaryColor: '#DF2120',
  logo: null,
  initial: 'T',
  sellerId: 100000,
  consultedAt: '28/09/2026 19:34:36',
  sections: [
    [
      { left: 'Tabela de cotação', right: '800/1/8000' },
      { left: 'Valor pra cada', right: 'R$1,00' },
    ],
    [{ left: [{ text: 'Para ' }, { text: 'Duque GP', bold: true }] }, { left: 'Valor válido (seco)' }],
    [{ left: 'Palpitão', right: 'R$ 800,00' }],
  ],
};

const decode = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

describe('comprovante em PDF', () => {
  it('cabeçalho, blocos e linhas em maiúsculas; acentos em octal e ( ) escapados', () => {
    const pdf = decode(buildReceiptPdf(input));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    for (const piece of [
      '(VENDEDOR: 100000)',
      '(28/09/2026 19:34:36)',
      String.raw`(TABELA DE COTA\307\303O)`,
      '(800/1/8000)',
      '/F2 10 Tf',
      '(DUQUE GP)',
      String.raw`(VALOR V\301LIDO \(SECO\))`,
      String.raw`(PALPIT\303O)`,
      '(R$ 800,00)',
      String.raw`/Title (Tabela de cota\347\343o)`,
    ]) {
      expect(pdf).toContain(piece);
    }
    // Só ASCII no arquivo (sem logo): acentos sempre escapados.
    expect(/[^\x09\x0A\x0D\x20-\x7E]/.test(pdf.slice(20))).toBe(false);
    // Altura = topo 38 + dois blocos de 2 linhas (12 + 28) + uma linha única (37,5) = 155,5, arredondada.
    expect(pdf).toContain('/MediaBox [0 0 320 156]');
  });

  it('a tabela xref aponta para o início de cada objeto', () => {
    const pdf = decode(buildReceiptPdf(input));
    const xrefAt = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const offsets = [...pdf.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(0);
    offsets.forEach((offset, i) => expect(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  it('com logo: embute o JPEG e o desenha no topo', () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = decode(buildReceiptPdf({ ...input, logo: { jpeg, width: 104, height: 120 } }));
    expect(pdf).toContain('/Filter /DCTDecode /Length 4');
    expect(pdf).toContain('/Im1 Do');
  });

  it('mede o texto com as larguras da Helvetica (para alinhar os valores à direita)', () => {
    expect(textWidth('R$ 20,00', false)).toBeCloseTo((722 + 556 + 278 + 556 * 2 + 278 + 556 * 2) / 100);
    expect(textWidth('Á', false)).toBe(textWidth('A', false));
    expect(textWidth('A', true)).toBeGreaterThan(textWidth('A', false));
  });
});
