import type { AdminPrizeListItem } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { matchesPrizeSearch, periodText } from './prizes-format';
import { PRIZES_PDF_COLUMNS, prizePdfRow, prizesPdfContent } from './prizes-report-pdf';
import { CONTENT_WIDTH, buildTablePdf, fitText, textWidth } from './table-pdf';

const item = (over: Partial<AdminPrizeListItem> = {}): AdminPrizeListItem => ({
  id: 'i1',
  status: 'PAID',
  game: 'lotteries',
  puleNumber: 4512,
  drawDate: '2026-10-08',
  lottery: 'LT PT RIO 09HS',
  drawCode: 'PTRIO09',
  modality: 'milhar',
  modalityLabel: 'MILHAR',
  guess: '1234',
  placement: 'p1',
  placementLabel: '1 PRÊMIO',
  stakeCents: 200,
  prizeCents: 800000,
  settledAt: '2026-10-08T12:30:00.000Z',
  player: { id: 'u1', displayId: 1020, name: 'José Ávila' },
  ...over,
});

const base = {
  tenantName: 'Banca Teste',
  query: { from: '2026-10-01', to: '2026-10-08', status: null },
  promoterLabel: null,
  totals: { total: 1, totalPrizeCents: 800000, pendingCount: 0, reviewsTotal: 0 },
  items: [item()],
  generatedAt: '09/10/2026 14:30',
};

const pdfText = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('formatação das pules premiadas', () => {
  it('período de um dia ou intervalo', () => {
    expect(periodText('2026-10-08', '2026-10-08')).toBe('08/10/2026');
    expect(periodText('2026-10-01', '2026-10-08')).toBe('01/10/2026 a 08/10/2026');
  });

  it('pesquisa por pule, apostador, loteria e número, sem acento', () => {
    expect(matchesPrizeSearch(item(), '4512')).toBe(true);
    expect(matchesPrizeSearch(item(), 'jose avila')).toBe(true);
    expect(matchesPrizeSearch(item(), 'ptrio')).toBe(true);
    expect(matchesPrizeSearch(item(), 'pt rio')).toBe(true);
    expect(matchesPrizeSearch(item(), '1234')).toBe(true);
    expect(matchesPrizeSearch(item(), 'fazendinha')).toBe(false);
    expect(matchesPrizeSearch(item({ guess: null }), '1234')).toBe(false);
    expect(matchesPrizeSearch(item(), '  ')).toBe(true);
  });
});

describe('conteúdo do PDF das pules premiadas', () => {
  it('cabeçalho com banca, período, filtros e totais; linhas como a tela', () => {
    const content = prizesPdfContent(base);
    expect(content.title).toBe('Pules Premiadas');
    expect(content.lines).toEqual([
      'Banca Teste',
      'Período: 01/10/2026 a 08/10/2026',
      'Promotor: Todos os promotores · Status: Todos',
      'Prêmios: 1 · Total em prêmios: R$ 8.000,00',
    ]);
    expect(content.footer).toBe('Gerado em 09/10/2026 14:30');
    expect(content.rows).toEqual([
      [
        '08/10/2026',
        '1020 · José Ávila',
        '4512',
        'LT PT RIO 09HS (PTRIO09)',
        'MILHAR',
        '1234',
        '1 PRÊMIO',
        'R$ 2,00',
        'R$ 8.000,00',
        'Pago',
      ],
    ]);
  });

  it('registro antigo sem rótulos mostra "—"; aguardando apuração', () => {
    const row = prizePdfRow(item({ modalityLabel: null, guess: null, placementLabel: null, status: 'PENDING' }));
    expect(row.slice(4, 7)).toEqual(['—', '—', '—']);
    expect(row[9]).toBe('Aguardando apuração');
  });

  it('promotor, situação, pendentes, corrigidos e corte de linhas entram no cabeçalho', () => {
    const content = prizesPdfContent({
      ...base,
      query: { from: '2026-10-08', to: '2026-10-08', status: 'pending' },
      promoterLabel: '7 · Ana',
      totals: { total: 6000, totalPrizeCents: 1, pendingCount: 3, reviewsTotal: 2 },
      items: Array.from({ length: 5000 }, () => item()),
    });
    expect(content.lines).toContain('Período: 08/10/2026');
    expect(content.lines).toContain('Promotor: 7 · Ana · Status: Aguardando apuração');
    expect(content.lines).toContain('3 pule(s) com sorteio já passado aguardando apuração.');
    expect(content.lines.some((l) => l.startsWith('Atenção: 2 pule(s) com resultado corrigido'))).toBe(true);
    expect(content.lines).toContain('Mostrando as primeiras 5000 de 6000 apostas premiadas (maiores prêmios).');
  });
});

describe('PDF em tabela', () => {
  it('as colunas cabem na largura do A4 deitado', () => {
    expect(PRIZES_PDF_COLUMNS.reduce((sum, c) => sum + c.width, 0)).toBeLessThanOrEqual(CONTENT_WIDTH);
  });

  it('mede e corta texto com reticências', () => {
    expect(textWidth('AB', false, 10)).toBeCloseTo(13.34);
    expect(fitText('curto', 100, false, 8)).toBe('curto');
    const cut = fitText('um texto bem comprido que não cabe', 40, false, 8);
    expect(cut.endsWith('…')).toBe(true);
    expect(textWidth(cut, false, 8)).toBeLessThanOrEqual(40);
  });

  it('gera PDF válido, quebra páginas e repete o cabeçalho das colunas', () => {
    const content = prizesPdfContent({ ...base, items: Array.from({ length: 80 }, () => item()) });
    const text = pdfText(buildTablePdf(content));
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 842 595]');
    const pages = Number(/\/Count (\d+)/.exec(text)![1]);
    expect(pages).toBeGreaterThan(1);
    expect(text.match(/\(Valor Pr\\352mio\) Tj/g)).toHaveLength(pages);
    expect(text).toContain(`(P\\341gina ${pages} de ${pages}) Tj`);
    expect(text).toContain('(1020 \\267 Jos\\351 \\301vila) Tj');
  });

  it('sem linhas: mostra o aviso', () => {
    const text = pdfText(buildTablePdf(prizesPdfContent({ ...base, items: [], totals: { ...base.totals, total: 0 } })));
    expect(text).toContain('(Nenhuma pule premiada no per\\355odo.) Tj');
    expect(text).toContain('/Count 1');
  });
});
