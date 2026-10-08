import type { PublicLotteryResult } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { TEST_SCHEDULE, testDraw } from '@/test/draws';
import { formatResultNumber, resultPrizeParts } from './result-format';
import { NO_RESULTS_TEXT, drawResults, resultsReceipt } from './results-receipt';

describe('números do resultado', () => {
  it('com todos os dígitos (zero à esquerda incluso) e ponto de milhar (Federal com 5 dígitos)', () => {
    expect(formatResultNumber('7977')).toBe('7.977');
    expect(formatResultNumber('0987')).toBe('0.987');
    expect(formatResultNumber('0007')).toBe('0.007');
    expect(formatResultNumber('0000')).toBe('0.000');
    expect(formatResultNumber('12345')).toBe('12.345');
    expect(formatResultNumber('01234')).toBe('01.234');
    // Centena do 7º prêmio.
    expect(formatResultNumber('245')).toBe('245');
    expect(formatResultNumber('045')).toBe('045');
  });

  it('grupo pelos dois últimos dígitos e o bicho dele (00 = grupo 25)', () => {
    expect(resultPrizeParts('7977')).toEqual({ number: '7.977 G.20', bicho: 'Peru' });
    expect(resultPrizeParts('0987')).toEqual({ number: '0.987 G.22', bicho: 'Tigre' });
    expect(resultPrizeParts('1204')).toEqual({ number: '1.204 G.01', bicho: 'Avestruz' });
    expect(resultPrizeParts('4300')).toEqual({ number: '4.300 G.25', bicho: 'Vaca' });
  });
});

describe('comprovante de resultados', () => {
  const base = { date: '2026-09-30', sellerId: 1366864, consultedAt: '30/09/2026 09:34:40' };

  it('cabeçalho com a data e um bloco por extração, com número e grupo em negrito e o bicho à direita', () => {
    const receipt = resultsReceipt({
      ...base,
      results: [{ drawName: 'LT PT RIO 09HS', prizes: ['7977', '5765', '2942', '6262', '2545', '5491', '0987'] }],
    });
    expect(receipt).toMatchObject({ title: 'Resultados', sellerId: 1366864, consultedAt: '30/09/2026 09:34:40' });
    const [header, draw] = receipt.sections;
    expect(header).toEqual([{ left: 'Resultados', right: '30/09/2026' }]);
    expect(draw).toHaveLength(8);
    expect(draw![0]).toEqual({ left: [{ text: '› ' }, { text: 'LT PT RIO 09HS', bold: true }] });
    expect(draw![1]).toEqual({
      left: [{ text: '1: ' }, { text: '7.977 G.20', bold: true }],
      right: 'Peru',
      rightBold: true,
    });
    expect(draw![7]).toMatchObject({ left: [{ text: '7: ' }, { text: '0.987 G.22', bold: true }], right: 'Tigre' });
  });

  it('sem nenhuma extração com resultado, o aviso', () => {
    expect(resultsReceipt({ ...base, results: [] }).sections).toEqual([
      [{ left: 'Resultados', right: '30/09/2026' }],
      [{ left: NO_RESULTS_TEXT }],
    ]);
  });
});

describe('extrações escolhidas com resultado', () => {
  const result = (lottery: string, extraction: number, head: string): PublicLotteryResult => ({
    lottery,
    lotteryName: lottery.toUpperCase(),
    extraction,
    prizes: [head, '1111', '2222', '3333', '4444'],
    sum: null,
    multiplication: null,
    skipped: null,
    super5: null,
    updatedAt: '2026-09-30T12:30:00.000Z',
  });

  it('na ordem do cadastro, pelo resultado ligado a cada sorteio; sem resultado ou excluído fica de fora', () => {
    const results = [result('ba', 10, '1000'), result('rj', 9, '0900'), result('fd', 19, '01900')];
    const ids = [
      testDraw('LT BAHIA 10HS').id,
      testDraw('LT PT RIO 11HS').id,
      'sorteio-excluido',
      testDraw('LT PT RIO 09HS').id,
    ];
    expect(drawResults(TEST_SCHEDULE.draws, ids, results)).toEqual([
      { drawName: 'LT PT RIO 09HS', prizes: ['0900', '1111', '2222', '3333', '4444'] },
      { drawName: 'LT BAHIA 10HS', prizes: ['1000', '1111', '2222', '3333', '4444'] },
    ]);
  });
});
