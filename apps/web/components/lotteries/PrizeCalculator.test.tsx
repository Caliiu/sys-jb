import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type PublicQuotes, defaultQuotes, findLotteryModality, findLotteryPlacement } from '@sysjb/contracts';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/loterias/calcular' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));

const { default: PrizeCalculator, simulatePrize } = await import('./PrizeCalculator');
const { InviteProvider } = await import('../dashboard/InviteProvider');

function renderCalculator(quotes: PublicQuotes = defaultQuotes()) {
  return renderWithProviders(
    <InviteProvider inviteCode="CDYGE">
      <PrizeCalculator quotes={quotes} />
    </InviteProvider>,
  );
}

const step = (name: RegExp) => screen.getByRole('button', { name });
const calculate = () => screen.getByRole('button', { name: 'Calcular prêmio' });
const pick = async (sheet: string, option: RegExp) =>
  userEvent.click(within(screen.getByRole('list', { name: sheet })).getByRole('button', { name: option }));

describe('Calcular prêmio', () => {
  it('começa com a cotação da banca, posição bloqueada e o botão desligado', () => {
    renderCalculator();
    expect(screen.getByRole('heading', { level: 1, name: 'Calcular prêmio' })).toBeInTheDocument();
    expect(screen.getByText('Quanto você pode ganhar?')).toBeInTheDocument();
    expect(step(/^Cotação: 800\/1\/8000/)).toBeEnabled();
    expect(step(/^Modalidade: Selecionar/)).toBeEnabled();
    expect(step(/^Posição: Selecionar/)).toBeDisabled();
    expect(screen.getByLabelText('Valor da aposta')).toHaveValue('R$ 0,00');
    expect(calculate()).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Fechar' })).toHaveAttribute('href', '/loterias');
  });

  it('Milhar, 1 prêmio, R$ 1,00: possível prêmio de R$ 8.000,00 e Apostar agora', async () => {
    renderCalculator();
    await userEvent.click(step(/^Modalidade/));
    await pick('Escolha a modalidade', /^MILHAR$/);
    await userEvent.click(step(/^Posição/));
    await pick('Escolha a posição', /^1 PRÊMIO$/);
    await userEvent.type(screen.getByLabelText('Valor da aposta'), '100');
    expect(screen.getByLabelText('Valor da aposta')).toHaveValue('R$ 1,00');
    expect(step(/^Modalidade: MILHAR$/)).toBeInTheDocument();
    expect(step(/^Posição: 1 PRÊMIO$/)).toBeInTheDocument();

    await userEvent.click(calculate());
    const result = screen.getByRole('dialog', { name: 'Possível prêmio' });
    expect(result).toHaveTextContent(/R\$\s*8\.000,00/);
    expect(result).toHaveTextContent(
      /Cotação\s*800\/1\/8000.*Modalidade\s*MILHAR.*Posição\s*1 PRÊMIO.*Aposta\s*R\$ 1,00/,
    );
    expect(within(result).getByRole('link', { name: 'Apostar agora' })).toHaveAttribute('href', '/loterias');
  });

  it('combos já vêm com a posição fixa; ao trocar de modalidade, a posição continua se ainda valer', async () => {
    renderCalculator();
    await userEvent.click(step(/^Modalidade/));
    await pick('Escolha a modalidade', /^MILHAR$/);
    await userEvent.click(step(/^Posição/));
    await pick('Escolha a posição', /^2 PRÊMIO$/);
    // Duque GP só aceita 1/5: a posição é trocada sozinha.
    await userEvent.click(step(/^Modalidade/));
    await pick('Escolha a modalidade', /^DUQUE GP$/);
    expect(step(/^Posição: 1\/5 PRÊMIO$/)).toBeInTheDocument();
    // Centena também aceita 1/5: a posição continua.
    await userEvent.click(step(/^Modalidade/));
    await pick('Escolha a modalidade', /^CENTENA$/);
    expect(step(/^Posição: 1\/5 PRÊMIO$/)).toBeInTheDocument();
  });

  it('mesma barra de ferramentas das Loterias, com Prêmio marcado', async () => {
    renderCalculator();
    const nav = within(screen.getByRole('navigation', { name: 'Ferramentas' }));
    expect(nav.getByRole('link', { name: 'Prêmio' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Horóscopo' })).not.toHaveAttribute('aria-current');
    expect(nav.getAllByRole('button').map((b) => b.textContent)).toEqual(['Sonhos', 'Atrasados']);
    await userEvent.click(nav.getByRole('button', { name: 'Sonhos' }));
    expect(screen.getByRole('status')).toHaveTextContent('Sonhos: disponível em breve.');
  });

  it('listas com "Escolha a …" e X para fechar sem escolher', async () => {
    renderCalculator();
    await userEvent.click(step(/^Modalidade/));
    const sheet = screen.getByRole('dialog', { name: 'Escolha a modalidade' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog', { name: 'Escolha a modalidade' })).toBeNull();
    expect(step(/^Modalidade: Selecionar/)).toBeInTheDocument();
  });

  it('modalidade desligada na cotação da banca não aparece', async () => {
    const quotes = defaultQuotes();
    renderCalculator({
      ...quotes,
      traditional: quotes.traditional.map((q) => (q.modality === 'unidade' ? { ...q, prizeCents: 0 } : q)),
    });
    await userEvent.click(step(/^Modalidade/));
    const names = within(screen.getByRole('list', { name: 'Escolha a modalidade' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names.some((n) => n?.startsWith('UNIDADE'))).toBe(false);
    expect(names.some((n) => n?.startsWith('MILHAR'))).toBe(true);
  });

  it('valor limitado a R$ 10.000,00', async () => {
    renderCalculator();
    await userEvent.type(screen.getByLabelText('Valor da aposta'), '99999999');
    expect(screen.getByLabelText('Valor da aposta')).toHaveValue('R$ 9.999,99');
  });

  it('conta igual à compra: divisor da posição, invertida e milhar e centena', () => {
    const quotes = defaultQuotes();
    const prize = (modality: string, placement: string, cents: number) =>
      simulatePrize(findLotteryModality(modality)!, findLotteryPlacement(placement)!, cents, quotes);
    expect(prize('milhar', 'p1', 100)).toBe(800_000);
    expect(prize('milhar', 'p1_5', 100)).toBe(160_000);
    expect(prize('milhar', 'p2_5', 400)).toBe(800_000);
    // Invertida: palpite de 4 dígitos diferentes = 24 combinações.
    expect(prize('milhar_invertida', 'p1', 2400)).toBe(800_000);
    // Milhar e centena: metade em cada.
    expect(prize('milhar_centena', 'p1', 200)).toBe(800_000 + 80_000);
  });
});
