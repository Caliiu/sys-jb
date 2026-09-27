import { describe, expect, it } from 'vitest';
import { commissionInputValue, formatCommission, parseCommission } from './commission';

describe('formatCommission', () => {
  it('centésimos de % em texto brasileiro', () => {
    expect(formatCommission(1000)).toBe('10%');
    expect(formatCommission(1250)).toBe('12,5%');
    expect(formatCommission(1205)).toBe('12,05%');
    expect(formatCommission(1)).toBe('0,01%');
    expect(formatCommission(50)).toBe('0,5%');
    expect(formatCommission(10000)).toBe('100%');
  });

  it('valor do campo não leva o "%"', () => {
    expect(commissionInputValue(1250)).toBe('12,5');
    expect(commissionInputValue(1000)).toBe('10');
  });
});

describe('parseCommission', () => {
  it('aceita vírgula, ponto e "%" e devolve inteiro', () => {
    expect(parseCommission('12,5')).toBe(1250);
    expect(parseCommission('12.5')).toBe(1250);
    expect(parseCommission(' 10 % ')).toBe(1000);
    expect(parseCommission('0,01')).toBe(1);
    expect(parseCommission('0,5')).toBe(50);
    expect(parseCommission('100')).toBe(10000);
    expect(parseCommission('12,05')).toBe(1205);
  });

  it('ida e volta com o formato salvo', () => {
    for (const bps of [1, 7, 10, 99, 100, 1234, 5000, 9999, 10000]) {
      expect(parseCommission(commissionInputValue(bps)), String(bps)).toBe(bps);
    }
  });

  it('recusa vazio, zero, acima de 100%, mais de 2 casas, negativo e lixo', () => {
    for (const bad of [
      '',
      ' ',
      '0',
      '0,00',
      '100,01',
      '101',
      '1000',
      '12,345',
      '-5',
      'abc',
      '1e2',
      '10,',
      ',5',
      '1,2,3',
    ]) {
      expect(parseCommission(bad), bad).toBeNull();
    }
  });
});
