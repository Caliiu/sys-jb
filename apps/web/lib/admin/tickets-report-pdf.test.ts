import type { AdminTicketListItem } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { CONTENT_WIDTH, buildTablePdf, textWidth } from './table-pdf';
import {
  TICKET_STATUS_LABELS,
  matchesTicketSearch,
  parsePuleKey,
  puleKey,
  soldCents,
  ticketNumberOf,
  ticketsBaseHref,
  withPule,
} from './tickets-format';
import { parseTicketsQuery } from './tickets-query';
import { TICKETS_PDF_COLUMNS, ticketPdfRow, ticketsPdfContent } from './tickets-report-pdf';

const NOW = '2026-10-09T15:00:00.000Z';

const item = (over: Partial<AdminTicketListItem> = {}): AdminTicketListItem => ({
  game: 'lotteries',
  puleNumber: 4512,
  createdAt: '2026-10-09T12:05:00.000Z',
  drawDate: '2026-10-09',
  lottery: 'LT PT RIO 09HS',
  drawCode: 'PTRIO09',
  totalCents: 1000,
  player: { id: 'u1', displayId: 1020, name: 'José Ávila' },
  canceledAt: null,
  quoteTable: '800/1/8000',
  prizeCents: 800000,
  status: 'WON',
  ...over,
});

const base = {
  tenantName: 'Banca Teste',
  query: { date: '2026-10-08', ticket: null },
  drawLabel: null,
  promoterLabel: null,
  playerLabel: null,
  totals: { total: 2, totalCents: 1000 },
  generatedAt: '09/10/2026 12:00',
};

describe('tickets-format', () => {
  it('pule na URL: jogo e número válidos; o resto é ignorado', () => {
    expect(parsePuleKey('lotteries-123')).toEqual({ game: 'lotteries', number: 123 });
    expect(parsePuleKey(['fazendinha-7', 'x'])).toEqual({ game: 'fazendinha', number: 7 });
    for (const raw of [
      undefined,
      '',
      'outro-1',
      'lotteries-0',
      'lotteries-abc',
      'lotteries-99999999999',
      'lotteries-1 ',
    ]) {
      expect(parsePuleKey(raw), String(raw)).toBeNull();
    }
    expect(puleKey(item({ game: 'fazendinha', puleNumber: 9 }))).toBe('fazendinha-9');
  });

  it('número digitado que pode ser pule', () => {
    expect(ticketNumberOf(' 4512 ')).toBe(4512);
    expect(ticketNumberOf('#77')).toBe(77);
    for (const text of ['', '0', 'abc', '12a', '2147483648']) expect(ticketNumberOf(text), text).toBeNull();
  });

  it('endereços: lista do dia ou pesquisa por número, com o detalhe aberto', () => {
    expect(ticketsBaseHref(parseTicketsQuery({ data: '2026-10-08', page: '2' }, NOW))).toBe(
      '/bilhetes?data=2026-10-08&page=2',
    );
    expect(ticketsBaseHref(parseTicketsQuery({ ticket: '77', data: '2026-10-08' }, NOW))).toBe('/bilhetes?ticket=77');
    expect(withPule('/bilhetes?ticket=77', 'fazendinha-77')).toBe('/bilhetes?ticket=77&pule=fazendinha-77');
  });

  it('pesquisa na página sem acento nem maiúsculas; total vendido sem as canceladas', () => {
    expect(matchesTicketSearch(item(), 'jose')).toBe(true);
    expect(matchesTicketSearch(item(), '#4512')).toBe(true);
    expect(matchesTicketSearch(item(), 'ptrio')).toBe(true);
    expect(matchesTicketSearch(item(), '1020')).toBe(true);
    expect(matchesTicketSearch(item(), 'fazendinha')).toBe(false);
    expect(soldCents([item(), item({ canceledAt: '2026-10-09T12:10:00.000Z', totalCents: 500 })])).toBe(1000);
  });
});

describe('PDF das Pules Registradas', () => {
  it('colunas cabem na página deitada; nenhum status é cortado', () => {
    expect(TICKETS_PDF_COLUMNS.reduce((sum, c) => sum + c.width, 0)).toBeLessThanOrEqual(CONTENT_WIDTH);
    const status = TICKETS_PDF_COLUMNS.find((c) => c.header === 'Status')!;
    for (const label of Object.values(TICKET_STATUS_LABELS)) {
      // Célula: 8pt, com 4pt de margem de cada lado.
      expect(textWidth(label, false, 8), label).toBeLessThanOrEqual(status.width - 8);
    }
    expect(TICKETS_PDF_COLUMNS.map((c) => c.header)).toEqual([
      'Pule',
      'Data/Hora',
      'Apostador',
      'Loteria',
      'Data Valendo',
      'Cotação',
      'Valor',
      'Valor Prêmio',
      'Status',
    ]);
  });

  it('linha: Fazendinha marcada, cotação vazia, cancelada entre parênteses', () => {
    expect(ticketPdfRow(item())).toEqual([
      '4512',
      '09/10/26 09:05',
      '1020 | JOSÉ ÁVILA',
      'LT PT RIO 09HS (PTRIO09)',
      '09/10/2026',
      '800/1/8000',
      'R$ 10,00',
      'R$ 8.000,00',
      'Premiada',
    ]);
    const row = ticketPdfRow(
      item({
        game: 'fazendinha',
        puleNumber: 7,
        quoteTable: null,
        canceledAt: '2026-10-09T13:00:00Z',
        status: 'CANCELED',
      }),
    );
    expect(row[0]).toBe('7 (Fazendinha)');
    expect(row[5]).toBe('—');
    expect(row[6]).toBe('(R$ 10,00)');
    expect(row[8]).toBe('Cancelada');
  });

  it('cabeçalho com os filtros e totais; aviso quando passa do limite', () => {
    const content = ticketsPdfContent({
      ...base,
      drawLabel: 'LT PT RIO 09:00',
      promoterLabel: '7 · Ana Promo',
      totals: { total: 9000, totalCents: 123456 },
      items: [item()],
    });
    expect(content.title).toBe('Pules Registradas');
    expect(content.lines).toEqual([
      'Banca Teste',
      'Data da venda: 08/10/2026 · Loteria: LT PT RIO 09:00',
      'Promotor: 7 · Ana Promo · Apostador: Todos',
      'Pules: 9000 · Total vendido: R$ 1.234,56 (sem as canceladas)',
      'Mostrando as primeiras 1 de 9000 pules (mais recentes).',
    ]);
    expect(content.rows).toHaveLength(1);
    expect(content.footer).toBe('Gerado em 09/10/2026 12:00');
  });

  it('pesquisa por número e lista vazia', () => {
    const content = ticketsPdfContent({
      ...base,
      query: { date: '2026-10-09', ticket: 77 },
      totals: { total: 0, totalCents: 0 },
      items: [],
    });
    expect(content.lines.slice(0, 2)).toEqual(['Banca Teste', 'Pesquisa da pule Nº 77 em todas as datas']);
    expect(content.emptyText).toBe('Nenhuma pule com esse número.');
    const pdf = new TextDecoder('latin1').decode(buildTablePdf(content));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/MediaBox [0 0 842 595]');
  });
});
