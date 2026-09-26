import type { PublicWallet } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import {
  isWithdrawalAmountValid,
  MAX_WITHDRAWAL_INPUT_CENTS,
  MIN_WITHDRAWAL_CENTS,
  parseWithdrawalAmount,
  withdrawalAmountProblem,
  withdrawalSummary,
} from './withdrawal';

const wallet = (over: Partial<PublicWallet> = {}): PublicWallet => ({
  balanceJb: 5000,
  bonusJb: 1000,
  prizesJb: 30000,
  balanceGames: 700,
  bonusGames: 0,
  prizesGames: 0,
  withdrawable: 0,
  totalAvailableJb: 36000,
  totalAvailableGames: 700,
  ...over,
});

describe('withdrawalSummary', () => {
  it('disponível = saldo total − recarga − bônus (só o saldo livre, os prêmios)', () => {
    expect(withdrawalSummary(wallet())).toEqual({ total: 36000, recharge: 5000, bonus: 1000, available: 30000 });
  });

  it('sem prêmios, nada é resgatável (recarga e bônus não podem ser sacados)', () => {
    const summary = withdrawalSummary(wallet({ prizesJb: 0, totalAvailableJb: 6000 }));
    expect(summary.available).toBe(0);
  });

  it('nunca fica negativo', () => {
    expect(withdrawalSummary(wallet({ totalAvailableJb: 100 })).available).toBe(0);
  });

  it('ignora o saldo de Games (usa o das loterias, como o "Saldo" do dashboard)', () => {
    expect(withdrawalSummary(wallet({ balanceGames: 999_999, totalAvailableGames: 999_999 })).available).toBe(30000);
  });
});

describe('valor do saque', () => {
  it('valida entre o mínimo e o disponível (inclusive nas pontas)', () => {
    expect(isWithdrawalAmountValid(MIN_WITHDRAWAL_CENTS, 30000)).toBe(true);
    expect(isWithdrawalAmountValid(30000, 30000)).toBe(true);
    expect(isWithdrawalAmountValid(MIN_WITHDRAWAL_CENTS - 1, 30000)).toBe(false);
    expect(isWithdrawalAmountValid(30001, 30000)).toBe(false);
    expect(isWithdrawalAmountValid(0, 0)).toBe(false);
    expect(isWithdrawalAmountValid(MIN_WITHDRAWAL_CENTS, MIN_WITHDRAWAL_CENTS - 1)).toBe(false);
  });

  it('mensagens: zero só orienta; acima do disponível; abaixo do mínimo', () => {
    expect(withdrawalAmountProblem(0, 30000)).toBeNull();
    expect(withdrawalAmountProblem(5000, 30000)).toBeNull();
    expect(withdrawalAmountProblem(30001, 30000)).toBe('Valor maior que o disponível para resgate');
    expect(withdrawalAmountProblem(50, 30000)).toBe('Valor mínimo para saque: R$ 1,00');
    // Sem saldo, qualquer valor acima de zero é "maior que o disponível" (e não "abaixo do mínimo").
    expect(withdrawalAmountProblem(1000, 0)).toBe('Valor maior que o disponível para resgate');
  });

  it('digitação com máscara de moeda e teto', () => {
    expect(parseWithdrawalAmount('R$ 0,105')).toBe(105);
    expect(parseWithdrawalAmount('')).toBe(0);
    expect(parseWithdrawalAmount(String(MAX_WITHDRAWAL_INPUT_CENTS))).toBe(MAX_WITHDRAWAL_INPUT_CENTS);
    expect(parseWithdrawalAmount(String(MAX_WITHDRAWAL_INPUT_CENTS + 1))).toBeNull();
  });
});
