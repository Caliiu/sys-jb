import { type BalanceReport, isReportDate, type PuleDetail, REPORT_DAYS_BACK, reportDates } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { balanceSections, movementSections, puleCard, puleReceipt, signedCents } from './report-receipts';

const balance = (extra: Partial<BalanceReport> = {}): BalanceReport => ({
  date: '2026-09-28',
  salesCents: 400,
  commissionCents: 0,
  prizes: [],
  entries: [],
  sentCents: 0,
  receivedCents: 0,
  previousCents: 700,
  balanceCents: 2500,
  ...extra,
});

describe('Consultar saldo', () => {
  it('valores com sinal: (+) para crédito e zero, (-) para débito', () => {
    expect(signedCents(1600)).toBe('16,00 (+)');
    expect(signedCents(-400)).toBe('4,00 (-)');
    expect(signedCents(0, true)).toBe('R$ 0,00 (+)');
    expect(signedCents(-250_000, true)).toBe('R$ 2.500,00 (-)');
  });

  it('com prêmios e créditos/débitos: blocos na ordem da tela', () => {
    const sections = balanceSections(
      balance({
        prizes: [{ puleNumber: 562229026, amountCents: 2200 }],
        entries: [
          { label: 'Crédito', amountCents: 1600 },
          { label: 'Ajuste', amountCents: -400 },
        ],
        sentCents: 500,
        receivedCents: 1000,
      }),
    );
    expect(sections).toEqual([
      [{ left: 'Consulta saldo', right: '28/09/2026' }],
      [
        { left: 'T.vendas:', right: '4,00' },
        { left: 'Comissão:', right: '0,00' },
      ],
      [{ left: 'Prêmios' }],
      [{ left: 'P.# 562229026', right: '22,00' }],
      [{ left: 'Crédito / débitos' }],
      [
        { left: 'Crédito', right: '16,00 (+)' },
        { left: 'Ajuste', right: '4,00 (-)' },
      ],
      [
        { left: 'Mandou:', right: '5,00 (+)' },
        { left: 'Recebeu:', right: '10,00 (-)' },
        { left: 'Saldo ant.:', right: 'R$ 7,00 (+)' },
      ],
      [{ left: 'Haver:', right: 'R$ 25,00 (+)' }],
    ]);
  });

  it('sem prêmios nem créditos/débitos: esses blocos não aparecem', () => {
    const labels = balanceSections(balance()).flatMap((s) => s.map((line) => line.left));
    expect(labels).toEqual([
      'Consulta saldo',
      'T.vendas:',
      'Comissão:',
      'Mandou:',
      'Recebeu:',
      'Saldo ant.:',
      'Haver:',
    ]);
  });
});

describe('Movimento loterias', () => {
  it('uma linha por extração; sem apostas, o aviso', () => {
    expect(
      movementSections({
        date: '2026-09-28',
        rows: [
          { code: 'LTTRIVO09', totalCents: 200 },
          { code: 'NAC12', totalCents: 100 },
        ],
      }),
    ).toEqual([
      [{ left: 'Movimento loterias', right: '28/09/2026' }],
      [
        { left: 'LTTRIVO09', right: '2,00' },
        { left: 'NAC12', right: '1,00' },
      ],
    ]);
    expect(movementSections({ date: '2026-09-28', rows: [] })).toEqual([[{ left: 'Não há movimento na data' }]]);
  });
});

const lotteryDetail: PuleDetail = {
  game: 'lotteries',
  cancellable: true,
  ticket: {
    puleNumber: 562361031,
    game: 'tradicional',
    drawDate: '2026-09-29',
    lottery: 'LT PT RIO 14HS',
    hour: 14,
    items: [
      {
        modality: 'milhar',
        modalityLabel: 'MILHAR',
        placement: 'p1',
        placementLabel: '1 PRÊMIO',
        guesses: ['3232'],
        amountCents: 100,
        split: 'total',
        totalCents: 100,
        quoteCents: 800_000,
        possiblePrizeCents: 800_000,
      },
    ],
    totalCents: 100,
    quoteTable: '800/1/8000',
    createdAt: '2026-09-28T15:05:21.000Z',
    sellerId: 1366864,
  },
};

const fazendinhaDetail: PuleDetail = {
  game: 'fazendinha',
  bet: {
    puleNumber: 562229026,
    drawDate: '2026-09-28',
    lottery: 'LOTTO TRIVO 09HS',
    hour: 9,
    mode: 'grupo',
    stakeCents: 100,
    prizeCents: 2200,
    quoteTable: '800/1/8000',
    numbers: [4, 5],
    totalCents: 200,
    createdAt: '2026-09-28T12:01:15.000Z',
    sellerId: 1366864,
  },
};

describe('recibo da pule', () => {
  it('Loterias: itens com modalidade/colocação, valor por todos e possível prêmio', () => {
    expect(puleCard(lotteryDetail)).toEqual({
      sellerId: 1366864,
      stampIso: '2026-09-28T15:05:21.000Z',
      drawDate: '2026-09-29',
      quoteTable: '800/1/8000',
      lottery: 'LT PT RIO 14HS',
      puleNumber: 562361031,
      gameLabel: 'Tradicional 1/7',
      items: [
        {
          title: 'MILHAR 1 PRÊMIO',
          guesses: ['3232'],
          amountCents: 100,
          splitLabel: 'TODOS',
          possiblePrizeCents: 800_000,
        },
      ],
      totalCents: 100,
    });
  });

  it('Fazendinha: "FAZENDINHA GP-1", palpites com 2 dígitos, por cada, sem possível prêmio', () => {
    expect(puleCard(fazendinhaDetail).items).toEqual([
      { title: 'Fazendinha GP-1', guesses: ['04', '05'], amountCents: 100, splitLabel: 'CADA' },
    ]);
  });

  it('PDF com o mesmo conteúdo do recibo', () => {
    const receipt = puleReceipt(puleCard(lotteryDetail), '28/09/26 12:05:21');
    expect(receipt).toMatchObject({ title: 'Pule #562361031', sellerId: 1366864, consultedAt: '28/09/26 12:05:21' });
    expect(receipt.sections).toEqual([
      [{ left: 'Recibo da aposta' }],
      [
        { left: 'Vale', right: '29/09/26' },
        { left: 'Cotação', right: '800/1/8000' },
        { left: 'Jogo', right: 'Tradicional 1/7' },
      ],
      [{ left: 'LT PT RIO 14HS', right: '#562361031' }],
      [
        { left: [{ text: 'MILHAR 1 PRÊMIO', bold: true }] },
        { left: '3232' },
        { left: '> R$ 1,00 / TODOS' },
        { left: '> Possível prêmio: R$ 8.000,00' },
      ],
      [{ left: 'Total jogo:', right: 'R$ 1,00' }],
      [{ left: 'A pagar', right: 'R$ 1,00' }],
      [{ left: [{ text: 'Confira sua aposta. Boa sorte!', bold: true }] }],
    ]);
    const bet = puleReceipt(puleCard(fazendinhaDetail), 'x').sections[3]!;
    expect(bet.map((line) => line.left)).not.toContainEqual(expect.stringContaining('Possível'));
  });
});

describe('datas dos relatórios (Brasília)', () => {
  // 28/09/2026 00:30 em Brasília (03:30 UTC).
  const NOW = '2026-09-28T03:30:00.000Z';

  it('saldo e movimento: hoje e 7 anteriores; pules: hoje e 6 anteriores', () => {
    expect(reportDates(NOW, REPORT_DAYS_BACK.balance)).toHaveLength(8);
    expect(reportDates(NOW, REPORT_DAYS_BACK.lotteryMovement).at(-1)).toBe('2026-09-21');
    expect(reportDates(NOW, REPORT_DAYS_BACK.pules)).toEqual([
      '2026-09-28',
      '2026-09-27',
      '2026-09-26',
      '2026-09-25',
      '2026-09-24',
      '2026-09-23',
      '2026-09-22',
    ]);
    expect(isReportDate(NOW, '2026-09-22', REPORT_DAYS_BACK.pules)).toBe(true);
    expect(isReportDate(NOW, '2026-09-21', REPORT_DAYS_BACK.pules)).toBe(false);
    expect(isReportDate(NOW, '2026-09-29', REPORT_DAYS_BACK.balance)).toBe(false);
    expect(isReportDate(NOW, '28/09/2026', REPORT_DAYS_BACK.balance)).toBe(false);
  });
});
