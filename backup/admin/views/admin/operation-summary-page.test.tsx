import type { AdminOperationSummary } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { operationSummaryHref, parseOperationSummaryQuery } from '@/lib/admin/operation-summary-query';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/resumo-operacao' }));

const { default: OperationSummaryPage } = await import('./OperationSummaryPage');

// 28/05/2026 12:00 em Brasília.
const NOW = '2026-05-28T15:00:00.000Z';
const TODAY = '2026-05-28';
const PROMOTER = { id: 'c'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b', displayId: 100001, name: 'Paula Promotora' };

const SUMMARY: AdminOperationSummary = {
  from: '2026-05-01',
  to: TODAY,
  promoter: null,
  newUsers: { signups: 12, firstDeposits: 0, firstDepositRateBps: 0, firstDepositAverageCents: 0 },
  cashflow: { depositsCents: 0, withdrawalsCents: 0, netCents: 0 },
  balances: { withdrawableCents: 0, totalCents: 6_591, creditedCents: 5_000, bonusCreditedCents: 250 },
  result: { wageredCents: 10_000, prizesCents: 4_000, grossCents: 6_000, commissionCents: 1_000, netCents: 5_000 },
  lotteries: { turnoverCents: 10_000, payoutCents: 4_000, netCents: 6_000 },
  casino: { turnoverCents: 0, payoutCents: 0, netCents: 0 },
  unavailable: ['deposits', 'withdrawals', 'casino'],
};

const show = (summary: AdminOperationSummary = SUMMARY, raw: Record<string, string> = {}) =>
  renderWithProviders(
    <OperationSummaryPage
      query={parseOperationSummaryQuery(raw, NOW)}
      today={TODAY}
      promoters={[PROMOTER]}
      summary={summary}
    />,
  );

/** Valor de uma linha (dt -> dd) dentro de um quadro. */
const value = (card: string, label: string) => {
  const region = screen.getByRole('region', { name: card });
  const term = within(region)
    .getAllByText(label, { selector: 'dt' })
    .find((dt) => !dt.closest('.sr-only'))!;
  return term.nextElementSibling?.textContent?.replace(/ /g, ' ');
};

describe('filtros do resumo na URL', () => {
  it('abre no mês até hoje; período inválido também volta para ele', () => {
    expect(parseOperationSummaryQuery({}, NOW)).toEqual({ from: '2026-05-01', to: TODAY, promoterId: '' });
    expect(parseOperationSummaryQuery({ de: '2026-05-10', ate: '2026-05-29' }, NOW)).toMatchObject({
      from: '2026-05-01',
    });
    expect(parseOperationSummaryQuery({ de: '2025-05-27', ate: TODAY }, NOW)).toMatchObject({ from: '2026-05-01' });
    expect(parseOperationSummaryQuery({ de: '2025-05-28', ate: TODAY }, NOW)).toMatchObject({ from: '2025-05-28' });
  });

  it('promotor só como UUID; o endereço omite "todos"', () => {
    expect(parseOperationSummaryQuery({ promotor: 'x' }, NOW).promoterId).toBe('');
    const query = parseOperationSummaryQuery({ de: '2026-05-01', ate: '2026-05-10', promotor: PROMOTER.id }, NOW);
    expect(operationSummaryHref(query)).toBe(`/resumo-operacao?de=2026-05-01&ate=2026-05-10&promotor=${PROMOTER.id}`);
    expect(operationSummaryHref({ ...query, promoterId: '' })).toBe('/resumo-operacao?de=2026-05-01&ate=2026-05-10');
  });
});

describe('Resumo da Operação', () => {
  it('filtros de período e promotor, abrindo no mês ("Mês" marcado)', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Resumo da Operação' })).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Filtrar resumo da operação' });
    expect(form).toHaveAttribute('action', '/resumo-operacao');
    expect(within(form).getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(form).getByLabelText('Início do período')).toHaveValue('2026-05-01');
    expect(within(form).getByLabelText('Promotor')).toHaveValue('');
  });

  it('cabeçalho com o período e o promotor; os seis quadros com os valores', () => {
    show();
    const summary = screen.getByRole('region', { name: 'Resumo' });
    expect(within(summary).getByText(/^Período:/, { selector: 'span' }).textContent).toBe(
      'Período: 01/05/2026 – 28/05/2026',
    );
    expect(summary).toHaveTextContent('Período: 01/05/2026 até 28/05/2026');
    expect(summary).toHaveTextContent('Promotor: Todos');

    expect(screen.getByText('12', { selector: 'span' })).toBeInTheDocument();
    expect(value('Novos Usuários', 'FTD')).toBe('0');
    expect(value('Novos Usuários', '% FTD')).toBe('0,00%');
    expect(value('Movimentação Financeira', 'Total Depósito')).toBe('R$ 0,00');
    expect(value('Saldos', 'Saldo Total')).toBe('R$ 65,91');
    expect(value('Saldos', 'Lançamento Creditado')).toBe('R$ 50,00');
    expect(value('Saldos', 'Bônus Creditado')).toBe('R$ 2,50');
    expect(value('Resultado', 'Total Jogado')).toBe('R$ 100,00');
    expect(value('Resultado', 'Bruto')).toBe('R$ 60,00');
    expect(value('Resultado', 'Comissão')).toBe('R$ 10,00');
    expect(value('Resultado', 'Líquido')).toBe('R$ 50,00');
    expect(value('Loterias', 'Turnover')).toBe('R$ 100,00');
    expect(value('Cassino', 'Payout')).toBe('R$ 0,00');
    expect(screen.getByText(/Ainda sem registro no sistema/).textContent).toContain(
      'depósitos (e o primeiro depósito), saques, cassino',
    );
  });

  it('líquido negativo em vermelho; positivo em verde; promotor pelo nome', () => {
    show({
      ...SUMMARY,
      promoter: PROMOTER,
      result: { ...SUMMARY.result, netCents: -500 },
    });
    expect(screen.getByRole('region', { name: 'Resumo' })).toHaveTextContent('Promotor: 100001 - Paula Promotora');
    const resultCard = screen.getByRole('region', { name: 'Resultado' });
    const net = within(resultCard).getByText('Líquido').nextElementSibling!;
    expect(net.className).toContain('text-admin-danger');
    expect(net.textContent?.replace(/ /g, ' ')).toMatch(/-R\$ 5,00|R\$ -5,00/);
  });
});
