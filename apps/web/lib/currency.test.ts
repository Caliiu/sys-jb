import { describe, expect, it } from 'vitest';
import { formatBrl, formatCents, parseCurrencyInput } from './currency';

describe('formatCents / formatBrl', () => {
  it('formata centavos com milhar e vírgula', () => {
    expect(formatCents(0)).toBe('0,00');
    expect(formatCents(123456)).toBe('1.234,56');
    expect(formatBrl(5)).toBe('R$ 0,05');
    expect(formatBrl(123456)).toBe('R$ 1.234,56');
  });
});

describe('parseCurrencyInput', () => {
  it('cada dígito entra pela direita; vazio vale zero; ignora o que não é dígito', () => {
    expect(parseCurrencyInput('R$ 0,005', 1_000_000)).toBe(5);
    expect(parseCurrencyInput('R$ 12,3', 1_000_000)).toBe(123);
    expect(parseCurrencyInput('', 1_000_000)).toBe(0);
    expect(parseCurrencyInput('abc 1x2y', 1_000_000)).toBe(12);
  });

  it('acima do teto retorna null (a tela mantém o valor anterior)', () => {
    expect(parseCurrencyInput('1000000', 1_000_000)).toBe(1_000_000);
    expect(parseCurrencyInput('1000001', 1_000_000)).toBeNull();
    expect(parseCurrencyInput('99999999999999999999', 1_000_000)).toBeNull();
  });
});
