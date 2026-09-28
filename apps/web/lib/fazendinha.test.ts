import { defaultQuotes, drawDateOf } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { TEST_SCHEDULE } from '@/test/draws';
import {
  BICHOS,
  dayLabel,
  groupOf,
  lotteryLabel,
  openLotteries,
  palpiteLabel,
  palpiteValues,
  offeredStakes,
} from './fazendinha';

// 28/09/2026 10:30 em Brasília (UTC-3).
const NOW = '2026-09-28T13:30:00.000Z';

describe('fazendinha', () => {
  it('valores oferecidos e prêmios vêm da cotação da banca', () => {
    const quotes = defaultQuotes().fazendinha;
    expect(offeredStakes(quotes, 'grupo')[0]).toEqual({ stakeCents: 100, prizeCents: 2_200 });
    expect(offeredStakes(quotes, 'dezena')[1]).toEqual({ stakeCents: 300, prizeCents: 26_400 });
    // CT-100 vem desligado (prêmio 0) na tabela padrão: não é oferecido.
    expect(offeredStakes(quotes, 'centena').map((s) => s.stakeCents)).not.toContain(10000);
    expect(offeredStakes(quotes, 'grupo').map((s) => s.stakeCents)).toContain(10000);
  });

  it('rótulo da extração é o nome do cadastro', () => {
    expect(lotteryLabel({ name: 'LT PT RIO 09HS' })).toBe('LT PT RIO 09HS');
  });

  it('dia no fuso de Brasília, inclusive perto da meia-noite UTC', () => {
    expect(dayLabel(NOW, 0)).toBe('Hoje - 28/09');
    expect(dayLabel(NOW, 1)).toBe('Amanhã - 29/09');
    expect(dayLabel(NOW, 2)).toBe('Qua - 30/09');
    expect(dayLabel(NOW, 3)).toBe('Qui - 01/10');
    expect(dayLabel('2026-09-29T02:00:00.000Z', 0)).toBe('Hoje - 28/09');
  });

  it('hoje só mostra as que ainda vendem; outros dias, todas as da Fazendinha que correm no dia, por horário', () => {
    const names = (offset: number) => openLotteries(TEST_SCHEDULE, NOW, drawDateOf(NOW, offset)).map(lotteryLabel);
    expect(names(0)).toEqual([
      'LT PT RIO 11HS',
      'LT NACIONAL 12HS',
      'LT BAHIA 12HS',
      'LT PT RIO 14HS',
      'LT BAHIA 15HS',
      'LT PT RIO 16HS',
      'LT PT RIO 21HS',
      'LT NACIONAL 23HS',
    ]);
    // Terça: sem Federal; Capital é só Loterias.
    expect(names(1)).toHaveLength(10);
    expect(names(1)).not.toContain('LT FEDERAL');
    expect(names(1)).not.toContain('LT CAPITAL 13HS');
    // Quarta: com Federal.
    expect(names(2)).toContain('LT FEDERAL');
  });

  it('vende até o horário máximo do cadastro (Brasília), inclusive a de amanhã cedo', () => {
    const at = (hhmm: string) => `2026-09-28T${hhmm}:00.000-03:00`;
    const open = (nowIso: string, offset: number, name: string) =>
      openLotteries(TEST_SCHEDULE, nowIso, drawDateOf(nowIso, offset)).some((l) => l.name === name);
    expect(open(at('11:17'), 0, 'LT PT RIO 11HS')).toBe(true);
    expect(open(at('11:18'), 0, 'LT PT RIO 11HS')).toBe(false);
    expect(open(at('10:04'), 0, 'LT BAHIA 10HS')).toBe(true);
    expect(open(at('10:05'), 0, 'LT BAHIA 10HS')).toBe(false);
    expect(open(at('23:59'), 1, 'LT PT RIO 09HS')).toBe(true);
    // Fora da janela de 6 dias, nada abre.
    expect(openLotteries(TEST_SCHEDULE, NOW, drawDateOf(NOW, 7))).toEqual([]);
  });

  it('exceções de data: dia sem sorteio e sorteio extra', () => {
    const tuesday = '2026-09-29';
    const federal = TEST_SCHEDULE.draws.find((d) => d.name === 'LT FEDERAL')!;
    const schedule = {
      ...TEST_SCHEDULE,
      exceptions: [
        { date: tuesday, drawId: federal.id, kind: 'EXTRA' as const },
        { date: '2026-09-30', drawId: null, kind: 'CANCEL' as const },
      ],
    };
    expect(openLotteries(schedule, NOW, drawDateOf(NOW, 1)).map(lotteryLabel)).toContain('LT FEDERAL');
    expect(openLotteries(schedule, NOW, drawDateOf(NOW, 2))).toEqual([]);
  });

  it('depois da meia-noite, a data que virou "ontem" não vende mais', () => {
    const afterMidnight = '2026-09-29T00:10:00.000-03:00';
    expect(openLotteries(TEST_SCHEDULE, afterMidnight, '2026-09-28')).toEqual([]);
    expect(openLotteries(TEST_SCHEDULE, afterMidnight, '2026-09-29').map(lotteryLabel)[0]).toBe('LT PT RIO 09HS');
  });

  it('busca ignora caixa e espaços', () => {
    const found = openLotteries(TEST_SCHEDULE, NOW, drawDateOf(NOW, 1), '  bahia 10 ');
    expect(found.map(lotteryLabel)).toEqual(['LT BAHIA 10HS']);
  });
});

describe('palpites', () => {
  it('grupo de dezenas e centenas pelo final de dois dígitos (00 = Vaca)', () => {
    expect(groupOf('grupo', 7)).toBe(7);
    expect(groupOf('dezena', 1)).toBe(1);
    expect(groupOf('dezena', 4)).toBe(1);
    expect(groupOf('dezena', 5)).toBe(2);
    expect(groupOf('dezena', 97)).toBe(25);
    expect(groupOf('dezena', 0)).toBe(25);
    expect(groupOf('centena', 300)).toBe(25);
    expect(groupOf('centena', 413)).toBe(4);
    expect(BICHOS[groupOf('dezena', 0) - 1]).toBe('Vaca');
  });

  it('valores e rótulos por modalidade', () => {
    expect(palpiteValues('grupo')).toHaveLength(25);
    const dezenas = palpiteValues('dezena');
    expect([dezenas[0], dezenas.at(-1), dezenas.length]).toEqual([1, 0, 100]);
    expect(palpiteValues('centena', 3).slice(0, 2)).toEqual([300, 301]);
    expect(palpiteLabel('dezena', 0)).toBe('00');
    expect(palpiteLabel('centena', 7)).toBe('007');
  });
});
