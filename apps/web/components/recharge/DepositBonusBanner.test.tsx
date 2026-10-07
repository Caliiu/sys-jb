import { type PublicDepositBonusOffers, depositBonusFor } from '@sysjb/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DepositBonusBanner from './DepositBonusBanner';

const OFFERS: PublicDepositBonusOffers = {
  offers: [
    { rule: 'FEDERAL', bps: 3000, maxCents: 5000 },
    { rule: 'DAILY', bps: 1000, maxCents: 30000 },
  ],
  minDepositCents: 1000,
};

describe('cálculo do bônus (o mesmo do banco)', () => {
  it('% do valor, para baixo no centavo, com teto; o maior vence; empate fica a primeira regra', () => {
    expect(depositBonusFor(10_000, OFFERS)).toEqual({ rule: 'FEDERAL', amountCents: 3000 });
    // Federal bate no teto (R$ 50); a diária (10% de R$ 1.000 = R$ 100) vence.
    expect(depositBonusFor(100_000, OFFERS)).toEqual({ rule: 'DAILY', amountCents: 10_000 });
    expect(depositBonusFor(1_001, { ...OFFERS, offers: [{ rule: 'DAILY', bps: 333, maxCents: 100 }] })).toEqual({
      rule: 'DAILY',
      amountCents: 33,
    });
    const tie: PublicDepositBonusOffers = {
      offers: [
        { rule: 'FIRST_DEPOSIT', bps: 1000, maxCents: 100 },
        { rule: 'DAILY', bps: 1000, maxCents: 100 },
      ],
      minDepositCents: 100,
    };
    expect(depositBonusFor(5000, tie)?.rule).toBe('FIRST_DEPOSIT');
  });

  it('abaixo do mínimo, sem ofertas ou valor inválido: nada', () => {
    expect(depositBonusFor(999, OFFERS)).toBeNull();
    expect(depositBonusFor(10_000, { ...OFFERS, offers: [] })).toBeNull();
    expect(depositBonusFor(Number.NaN, OFFERS)).toBeNull();
  });
});

describe('aviso de bônus na recarga', () => {
  it('mostra a melhor % e quanto esta recarga ganha', () => {
    render(<DepositBonusBanner bonus={OFFERS} amountCents={10_000} destination="lotteries" />);
    const banner = screen.getByRole('region', { name: 'Bônus de recarga' });
    expect(banner).toHaveTextContent('Recarga do dia da Federal: 30% de bônus (até R$ 50,00)');
    expect(screen.getByRole('status')).toHaveTextContent('Nesta recarga você ganha R$ 30,00 de bônus.');
  });

  it('recarga de cassino, abaixo do mínimo e sem ofertas', () => {
    const { rerender } = render(<DepositBonusBanner bonus={OFFERS} amountCents={10_000} destination="games" />);
    expect(screen.getByRole('status')).toHaveTextContent('O bônus vale só para recargas de Loterias.');
    rerender(<DepositBonusBanner bonus={OFFERS} amountCents={500} destination={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('Recarregue a partir de R$ 10,00.');
    rerender(<DepositBonusBanner bonus={{ ...OFFERS, offers: [] }} amountCents={10_000} destination="lotteries" />);
    expect(screen.queryByRole('region', { name: 'Bônus de recarga' })).toBeNull();
  });
});
