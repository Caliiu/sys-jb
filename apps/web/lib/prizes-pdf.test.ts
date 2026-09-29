import { isPrizeDate, normalizePuleCode, prizeDates, type PrizesReport } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { claimMessage, claimReceipt, groupByLottery, prizesReceipt } from './prizes-pdf';

const ticket = (puleNumber: number, lottery: string, hour: number) => ({
  puleNumber,
  lottery,
  hour,
  items: [{ label: 'FZG1 1/1', amountCents: 100, prizeCents: 2200, guesses: ['05'] }],
  prizeCents: 2200,
});

const report: PrizesReport = {
  date: '2026-09-28',
  tickets: [
    ticket(562229026, 'LOTTO TRIVO 09HS', 9),
    ticket(562229030, 'LOTTO TRIVO 09HS', 9),
    ticket(7, 'LT PT RIO 11HS', 11),
  ],
  totalPrizeCents: 6600,
};

describe('premiadas: comprovante', () => {
  it('agrupa as pules pela extração, mantendo a ordem', () => {
    expect(groupByLottery(report.tickets).map((g) => [g.lottery, g.tickets.map((t) => t.puleNumber)])).toEqual([
      ['LOTTO TRIVO 09HS', [562229026, 562229030]],
      ['LT PT RIO 11HS', [7]],
    ]);
  });

  it('data, extração, pule (aposta, prêmio e palpites) e total, como na tela', () => {
    const receipt = prizesReceipt(report, 1366864, '28/09/2026 20:18:40');
    expect(receipt).toMatchObject({ title: 'Premiadas', sellerId: 1366864, consultedAt: '28/09/2026 20:18:40' });
    expect(receipt.sections.slice(0, 3)).toEqual([
      [{ left: 'Premiadas', right: '28/09/2026' }],
      [{ left: 'LOTTO TRIVO 09HS' }],
      [{ left: 'Pule #562229026' }, { left: 'FZG1 1/1  1,00', right: '22,00' }, { left: '05' }],
    ]);
    expect(receipt.sections.at(-1)).toEqual([{ left: 'Total P.', right: 'R$ 66,00' }]);
    expect(receipt.sections).toHaveLength(7);
  });

  it('sem premiadas: só o aviso', () => {
    expect(prizesReceipt({ date: '2026-09-28', tickets: [], totalPrizeCents: 0 }, 1, 'x').sections).toEqual([
      [{ left: 'Nenhuma pule premiada' }],
    ]);
  });
});

describe('premiadas: datas consultáveis (Brasília)', () => {
  // 28/09/2026 00:30 em Brasília (03:30 UTC): o "hoje" é o de Brasília.
  const NOW = '2026-09-28T03:30:00.000Z';

  it('hoje e os 7 dias anteriores, do mais recente para o mais antigo', () => {
    expect(prizeDates(NOW)).toEqual([
      '2026-09-28',
      '2026-09-27',
      '2026-09-26',
      '2026-09-25',
      '2026-09-24',
      '2026-09-23',
      '2026-09-22',
      '2026-09-21',
    ]);
    expect(prizeDates('2026-03-02T15:00:00Z').slice(-2)).toEqual(['2026-02-24', '2026-02-23']);
  });

  it('aceita só datas válidas dentro da janela', () => {
    expect(isPrizeDate(NOW, '2026-09-28')).toBe(true);
    expect(isPrizeDate(NOW, '2026-09-21')).toBe(true);
    expect(isPrizeDate(NOW, '2026-09-20')).toBe(false);
    expect(isPrizeDate(NOW, '2026-09-29')).toBe(false);
    expect(isPrizeDate(NOW, '2026-02-30')).toBe(false);
    expect(isPrizeDate(NOW, '../../v1/users')).toBe(false);
  });
});

describe('reclame', () => {
  it('código da pule: só o número do comprovante (espaços são ignorados)', () => {
    expect(normalizePuleCode('562229026')).toBe('562229026');
    expect(normalizePuleCode(' 562 229 026 ')).toBe('562229026');
    for (const bad of ['', '0', '0123', '-5', '1e3', '12a', '1.000', '1000000000000', '١٢٣']) {
      expect(normalizePuleCode(bad), bad).toBeNull();
    }
  });

  it('mensagem e comprovante', () => {
    expect(claimMessage({ status: 'not_found' })).toBe('Prêmio não encontrado');
    expect(claimMessage({ status: 'paid', paidOn: '2026-09-28' })).toBe('Prêmio pago em 28/09/26');
    expect(claimReceipt({ status: 'not_found' }, 1366864, '28/09/2026 20:22:07')).toEqual({
      title: 'Reclame',
      sellerId: 1366864,
      consultedAt: '28/09/2026 20:22:07',
      sections: [[{ left: 'Prêmio não encontrado' }]],
    });
  });
});
