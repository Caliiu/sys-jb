import { screen, within } from '@testing-library/react';
import type { AdminCommissionMonth } from '@sysjb/contracts';
import { describe, expect, it, vi } from 'vitest';
import { monthBefore, monthLabel, parseCommissionMonth } from '@/lib/admin/commissions-query';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/app/admin/actions', () => ({ setReferralRateAction: vi.fn(), closeCommissionMonthAction: vi.fn() }));

const { default: CommissionsPage } = await import('./CommissionsPage');

const rows: AdminCommissionMonth['rows'] = [
  {
    user: { id: 'u-p', displayId: 100001, name: 'Paula Promotora', status: 'ACTIVE' },
    wageredCents: 300000,
    referralRateBps: 300,
    promoterRateBps: 700,
    amountCents: 30000,
    status: 'PAID',
  },
  {
    user: { id: 'u-j', displayId: 100002, name: 'João Jogador', status: 'ACTIVE' },
    wageredCents: 50000,
    referralRateBps: 300,
    promoterRateBps: 0,
    amountCents: 1500,
    status: 'PAID',
  },
  {
    user: { id: 'u-b', displayId: 100003, name: 'Bruno Bloqueado', status: 'BLOCKED' },
    wageredCents: 20000,
    referralRateBps: 300,
    promoterRateBps: 0,
    amountCents: 600,
    status: 'BLOCKED',
  },
];

const openMonth: AdminCommissionMonth = {
  month: '2026-08',
  closed: null,
  canClose: true,
  rows,
  totals: { wageredCents: 370000, paidCents: 31500 },
};

function renderPage(data: AdminCommissionMonth, canManage = true) {
  renderWithProviders(
    <CommissionsPage
      settings={{ referralCommissionBps: 300 }}
      data={data}
      closings={[]}
      months={['2026-09', '2026-08']}
      canManage={canManage}
    />,
  );
}

describe('Comissões', () => {
  it('prévia: indicação e promotor somados, bloqueado não recebe, total e botão de fechar', () => {
    renderPage(openMonth);
    expect(screen.getByRole('heading', { level: 1, name: 'Comissões' })).toBeInTheDocument();
    expect(screen.getByLabelText('Percentual (%)')).toHaveValue('3');

    const body = screen.getAllByRole('row').slice(1, 4);
    expect(body[0]).toHaveTextContent(
      /Paula Promotora.*Indicação \+ Promotor.*R\$ 3\.000,00.*3% \+ 7% = 10%.*R\$ 300,00.*A pagar/,
    );
    expect(body[1]).toHaveTextContent(/João Jogador.*Indicação.*R\$ 500,00.*3%.*R\$ 15,00.*A pagar/);
    expect(body[2]).toHaveTextContent(/Bruno Bloqueado.*R\$ 6,00.*Bloqueado: não recebe/);
    expect(screen.getByRole('row', { name: /Total/ })).toHaveTextContent(/R\$ 3\.700,00.*R\$ 315,00.*a pagar/);
    expect(screen.getByRole('button', { name: 'Fechar mês' })).toBeInTheDocument();
    expect(within(body[0]!).getByRole('link', { name: 'Paula Promotora' })).toHaveAttribute('href', '/usuarios/u-p');
  });

  it('mês fechado mostra quem fechou e "Pago no Saldo"; sem botão de fechar', () => {
    renderPage({
      ...openMonth,
      canClose: false,
      closed: { closedAt: '2026-09-01T13:00:00.000Z', operatorName: 'Gerente Sintético', totalPaidCents: 31500 },
    });
    expect(screen.getByText(/Fechado em 01\/09\/2026 10:00 por Gerente Sintético/)).toBeInTheDocument();
    expect(screen.getAllByText('Pago no Saldo')).toHaveLength(2);
    expect(screen.getByText('Bloqueado: não recebeu')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fechar mês' })).toBeNull();
  });

  it('Financeiro vê o percentual e a prévia, mas não altera nem fecha', () => {
    renderPage(openMonth, false);
    expect(screen.getByText(/Percentual atual/)).toHaveTextContent('Percentual atual: 3%');
    expect(screen.queryByLabelText('Percentual (%)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fechar mês' })).toBeNull();
  });

  it('sem apostas de indicados: avisa', () => {
    renderPage({ ...openMonth, rows: [], totals: { wageredCents: 0, paidCents: 0 } });
    expect(screen.getByText('Nenhuma aposta de jogadores indicados neste mês.')).toBeInTheDocument();
  });
});

describe('meses das comissões', () => {
  it('mês anterior em Brasília, inclusive na virada do ano', () => {
    expect(monthBefore('2026-09-28T13:00:00.000Z', 1)).toBe('2026-08');
    expect(monthBefore('2026-01-10T13:00:00.000Z', 1)).toBe('2025-12');
    // 1º de janeiro às 01h UTC ainda é 31/12 em Brasília.
    expect(monthBefore('2026-01-01T01:00:00.000Z', 0)).toBe('2025-12');
    expect(parseCommissionMonth({}, '2026-09-28T13:00:00.000Z')).toBe('2026-08');
    expect(parseCommissionMonth({ mes: '2026-13' }, '2026-09-28T13:00:00.000Z')).toBe('2026-08');
    expect(parseCommissionMonth({ mes: '2025-02' }, '2026-09-28T13:00:00.000Z')).toBe('2025-02');
    expect(monthLabel('2026-08')).toBe('agosto de 2026');
  });
});
