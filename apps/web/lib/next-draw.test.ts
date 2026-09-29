import type { DrawSchedule, PublicDraw } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { nextDraw } from './next-draw';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const draw = (id: string, name: string, drawTime: string, extra: Partial<PublicDraw> = {}): PublicDraw => ({
  id,
  group: 'CAPITAL',
  name,
  hour: Number(drawTime.slice(0, 2)),
  drawTime,
  closesAt: drawTime,
  weekdays: ALL_DAYS,
  games: ['lotteries'],
  ...extra,
});

const schedule = (draws: PublicDraw[], exceptions: DrawSchedule['exceptions'] = []): DrawSchedule => ({
  draws,
  exceptions,
});

// Segunda, 28/09/2026 19:50 em Brasília.
const NOW = '2026-09-28T22:50:00.000Z';

describe('próximo sorteio', () => {
  it('o de horário mais cedo que ainda não começou, de Loterias ou Fazendinha', () => {
    const s = schedule([
      draw('1', 'LT CAPITAL 18HS', '18:00'),
      draw('2', 'LT CAPITAL 21HS', '21:00'),
      draw('3', 'LT CAPITAL 20HS', '20:00', { games: ['fazendinha'] }),
    ]);
    expect(nextDraw(NOW, s)).toEqual({ label: 'LT CAPITAL 20HS', startsAt: '2026-09-28T23:00:00.000Z' });
  });

  it('depois do último do dia, passa para o primeiro de amanhã', () => {
    const s = schedule([draw('1', 'LT CAPITAL 09HS', '09:00'), draw('2', 'LT CAPITAL 18HS', '18:00')]);
    expect(nextDraw(NOW, s)).toEqual({ label: 'LT CAPITAL 09HS', startsAt: '2026-09-29T12:00:00.000Z' });
  });

  it('respeita os dias da semana e as exceções (cancelado hoje, feriado amanhã)', () => {
    const s = schedule(
      [
        draw('1', 'LT CAPITAL 20HS', '20:00'),
        draw('2', 'FEDERAL 19HS', '19:00', { weekdays: [3] }),
        draw('3', 'LT CAPITAL 10HS', '10:00'),
      ],
      [
        { date: '2026-09-28', drawId: '1', kind: 'CANCEL' },
        { date: '2026-09-29', drawId: null, kind: 'CANCEL' },
      ],
    );
    // Terça é feriado; quarta corre o das 10h antes da Federal das 19h.
    expect(nextDraw(NOW, s)).toEqual({ label: 'LT CAPITAL 10HS', startsAt: '2026-09-30T13:00:00.000Z' });
  });

  it('sem sorteio pela frente, null', () => {
    expect(nextDraw(NOW, schedule([]))).toBeNull();
    expect(nextDraw(NOW, schedule([draw('1', 'SEM JOGO', '20:00', { games: [] })]))).toBeNull();
  });
});
