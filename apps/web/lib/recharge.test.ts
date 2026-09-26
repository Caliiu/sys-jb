import { describe, expect, it } from 'vitest';
import { formatBrl } from './currency';
import {
  addAmount,
  formatClock,
  MAX_RECHARGE_CENTS,
  parseAmountInput,
  parseChargeRequest,
  validateRecharge,
} from './recharge';

describe('parseAmountInput', () => {
  it('cada dígito entra pela direita, como máscara de moeda', () => {
    expect(parseAmountInput('R$ 0,005')).toBe(5);
    expect(parseAmountInput('R$ 0,0512')).toBe(512);
    expect(parseAmountInput('R$ 12,3')).toBe(123);
  });

  it('apagar o último dígito volta um passo; vazio vale zero', () => {
    expect(parseAmountInput('R$ 1,0')).toBe(10);
    expect(parseAmountInput('')).toBe(0);
    expect(parseAmountInput('R$ ')).toBe(0);
  });

  it('ignora tudo que não é dígito', () => {
    expect(parseAmountInput('abc 1x2y')).toBe(12);
  });

  it('acima do teto retorna null (a tela mantém o valor anterior)', () => {
    expect(parseAmountInput(String(MAX_RECHARGE_CENTS))).toBe(MAX_RECHARGE_CENTS);
    expect(parseAmountInput(String(MAX_RECHARGE_CENTS + 1))).toBeNull();
    expect(parseAmountInput('99999999999999999999')).toBeNull();
  });
});

describe('addAmount', () => {
  it('soma e respeita o teto', () => {
    expect(addAmount(0, 3000)).toBe(3000);
    expect(addAmount(3000, 5000)).toBe(8000);
    expect(addAmount(MAX_RECHARGE_CENTS - 100, 20000)).toBe(MAX_RECHARGE_CENTS);
  });
});

describe('validateRecharge', () => {
  it('exige o valor mínimo e o destino, nessa ordem', () => {
    expect(validateRecharge(0, null)).toBe('Informe um valor mínimo de R$ 1,00.');
    expect(validateRecharge(99, 'games')).toBe('Informe um valor mínimo de R$ 1,00.');
    expect(validateRecharge(100, null)).toBe('Escolha onde usar o crédito.');
    expect(validateRecharge(100, 'lotteries')).toBeNull();
  });
});

describe('formatBrl', () => {
  it('formata centavos com milhar', () => {
    expect(formatBrl(0)).toBe('R$ 0,00');
    expect(formatBrl(123456)).toBe('R$ 1.234,56');
  });
});

describe('parseChargeRequest', () => {
  it('aceita valor (centavos inteiros) e destino válidos', () => {
    expect(parseChargeRequest({ amountCents: 5000, destination: 'lotteries' })).toEqual({
      amountCents: 5000,
      destination: 'lotteries',
    });
    expect(parseChargeRequest({ amountCents: 100, destination: 'games' })).toEqual({
      amountCents: 100,
      destination: 'games',
    });
    expect(parseChargeRequest({ amountCents: MAX_RECHARGE_CENTS, destination: 'games' })).not.toBeNull();
  });

  it('rejeita entrada que não é objeto', () => {
    for (const input of [null, undefined, 'x', 5000, []]) expect(parseChargeRequest(input)).toBeNull();
  });

  it('rejeita valor ausente, não inteiro, fora dos limites ou de outro tipo', () => {
    const invalid = [undefined, '5000', 50.5, NaN, Infinity, -100, 0, 99, MAX_RECHARGE_CENTS + 1];
    for (const amountCents of invalid) {
      expect(parseChargeRequest({ amountCents, destination: 'games' }), String(amountCents)).toBeNull();
    }
  });

  it('rejeita destino ausente ou desconhecido', () => {
    expect(parseChargeRequest({ amountCents: 5000 })).toBeNull();
    expect(parseChargeRequest({ amountCents: 5000, destination: 'outro' })).toBeNull();
    expect(parseChargeRequest({ amountCents: 5000, destination: ['games'] })).toBeNull();
  });
});

describe('formatClock', () => {
  it('formata segundos como MM:SS', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(271)).toBe('04:31');
    expect(formatClock(300)).toBe('05:00');
  });
});
