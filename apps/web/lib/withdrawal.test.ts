import type { PublicWallet, PublicWithdrawal } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WITHDRAWAL_LIMITS,
  isWithdrawalAmountValid,
  MAX_WITHDRAWAL_INPUT_CENTS,
  maxWithdrawalCents,
  parseWithdrawalAmount,
  toWithdrawalItem,
  withdrawalAmountProblem,
  withdrawalBlocker,
  withdrawalKeyTypeForApi,
  withdrawalSummary,
  type WithdrawalLimits,
} from './withdrawal';

const wallet = (over: Partial<PublicWallet> = {}): PublicWallet => ({
  balanceJb: 5000,
  bonusJb: 1000,
  prizesJb: 30000,
  balanceGames: 700,
  bonusGames: 0,
  prizesGames: 4000,
  withdrawable: 34000,
  totalAvailableJb: 36000,
  totalAvailableGames: 4700,
  ...over,
});

/** Limites: R$ 10,00 a R$ 500,00, 3 por dia. */
const limits = (over: Partial<WithdrawalLimits> = {}): WithdrawalLimits => ({ ...DEFAULT_WITHDRAWAL_LIMITS, ...over });

describe('withdrawalSummary', () => {
  it('prêmios das loterias + ganhos do cassino; o disponível é o sacável da carteira', () => {
    expect(withdrawalSummary(wallet())).toEqual({ lotteries: 30000, casino: 4000, available: 34000 });
  });

  it('recarga e bônus nunca entram (o servidor já manda o sacável sem eles)', () => {
    expect(withdrawalSummary(wallet({ prizesJb: 0, prizesGames: 0, withdrawable: 0 })).available).toBe(0);
  });
});

describe('valor do saque', () => {
  it('válido entre o mínimo da banca e o menor entre o disponível e o máximo (inclusive nas pontas)', () => {
    expect(isWithdrawalAmountValid(1000, 34000, limits())).toBe(true);
    expect(isWithdrawalAmountValid(34000, 34000, limits())).toBe(true);
    expect(isWithdrawalAmountValid(999, 34000, limits())).toBe(false);
    expect(isWithdrawalAmountValid(34001, 34000, limits())).toBe(false);
    expect(isWithdrawalAmountValid(20001, 50000, limits({ maxCents: 20000 }))).toBe(false);
    expect(maxWithdrawalCents(50000, limits({ maxCents: 20000 }))).toBe(20000);
    expect(maxWithdrawalCents(800, limits())).toBe(800);
  });

  it('pausado ou com o limite do dia atingido, nada é válido (e a tela explica)', () => {
    expect(isWithdrawalAmountValid(5000, 34000, limits({ enabled: false }))).toBe(false);
    expect(isWithdrawalAmountValid(5000, 34000, limits({ usedToday: 3 }))).toBe(false);
    expect(withdrawalBlocker(limits({ enabled: false }))).toBe(
      'Saques pausados no momento. Tente novamente mais tarde.',
    );
    expect(withdrawalBlocker(limits({ usedToday: 3 }))).toBe('Você já fez 3 saques hoje. Tente amanhã.');
    expect(withdrawalBlocker(limits({ usedToday: 1, dailyCount: 1 }))).toBe('Você já fez 1 saque hoje. Tente amanhã.');
    expect(withdrawalBlocker(limits())).toBeNull();
  });

  it('mensagens: zero só orienta; acima do disponível; acima do máximo; abaixo do mínimo', () => {
    expect(withdrawalAmountProblem(0, 34000, limits())).toBeNull();
    expect(withdrawalAmountProblem(5000, 34000, limits())).toBeNull();
    expect(withdrawalAmountProblem(34001, 34000, limits())).toBe('Valor maior que o disponível para resgate');
    expect(withdrawalAmountProblem(30000, 34000, limits({ maxCents: 20000 }))).toBe(
      'Valor máximo por saque: R$ 200,00',
    );
    expect(withdrawalAmountProblem(500, 34000, limits())).toBe('Valor mínimo para saque: R$ 10,00');
  });

  it('digitação com máscara de moeda e teto', () => {
    expect(parseWithdrawalAmount('R$ 0,105')).toBe(105);
    expect(parseWithdrawalAmount('')).toBe(0);
    expect(parseWithdrawalAmount(String(MAX_WITHDRAWAL_INPUT_CENTS))).toBe(MAX_WITHDRAWAL_INPUT_CENTS);
    expect(parseWithdrawalAmount(String(MAX_WITHDRAWAL_INPUT_CENTS + 1))).toBeNull();
  });
});

describe('saque da API -> tela', () => {
  it('converte o tipo da chave e mantém motivo e cancelamento', () => {
    const api: PublicWithdrawal = {
      id: 'w1',
      amountCents: 5000,
      status: 'REJECTED',
      keyType: 'PHONE',
      keyValue: '11987654321',
      createdAt: '2026-10-06T12:00:00.000Z',
      paidAt: null,
      note: 'Chave de outra pessoa',
      cancellable: false,
    };
    expect(toWithdrawalItem(api)).toEqual({
      id: 'w1',
      amountCents: 5000,
      status: 'REJECTED',
      keyType: 'phone',
      keyValue: '11987654321',
      createdAt: '2026-10-06T12:00:00.000Z',
      note: 'Chave de outra pessoa',
      cancellable: false,
    });
    expect(withdrawalKeyTypeForApi('random')).toBe('RANDOM');
    expect(withdrawalKeyTypeForApi('cpf')).toBe('CPF');
  });
});
