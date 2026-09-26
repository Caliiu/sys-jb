import { describe, expect, it } from 'vitest';
import { groupWithdrawalsByDay, type WithdrawalItem } from './withdrawal';

// 26/09/2026 14:00 em Brasília (UTC-3).
const NOW = '2026-09-26T17:00:00.000Z';

const item = (id: string, createdAt: string): WithdrawalItem => ({
  id,
  amountCents: 1000,
  status: 'PENDING',
  keyType: 'cpf',
  keyValue: '52998224725',
  createdAt,
});

describe('groupWithdrawalsByDay', () => {
  it('agrupa em Hoje, Ontem e datas, do mais recente para o mais antigo', () => {
    const groups = groupWithdrawalsByDay(
      [
        item('antigo', '2026-09-20T15:00:00.000Z'),
        item('hoje-tarde', '2026-09-26T16:00:00.000Z'),
        item('ontem', '2026-09-25T20:00:00.000Z'),
        item('hoje-cedo', '2026-09-26T11:00:00.000Z'),
      ],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(['Hoje', 'Ontem', '20/09/2026']);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['hoje-tarde', 'hoje-cedo']);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(['ontem']);
  });

  it('usa o dia de Brasília, não o de UTC (23h de ontem ainda é ontem)', () => {
    // 02:30 UTC de 26/09 = 23:30 de 25/09 em Brasília.
    const groups = groupWithdrawalsByDay([item('a', '2026-09-26T02:30:00.000Z')], NOW);
    expect(groups.map((g) => g.label)).toEqual(['Ontem']);
  });

  it('meia-noite: 00:10 de hoje em Brasília é Hoje', () => {
    const groups = groupWithdrawalsByDay([item('a', '2026-09-26T03:10:00.000Z')], NOW);
    expect(groups.map((g) => g.label)).toEqual(['Hoje']);
  });

  it('lista vazia não gera grupos e a original não é alterada', () => {
    expect(groupWithdrawalsByDay([], NOW)).toEqual([]);
    const original = [item('a', '2026-09-20T15:00:00.000Z'), item('b', '2026-09-26T16:00:00.000Z')];
    groupWithdrawalsByDay(original, NOW);
    expect(original.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
