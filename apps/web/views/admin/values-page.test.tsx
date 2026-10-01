import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/app/admin/actions', () => ({ setReferralRateAction: vi.fn() }));

const { default: ValuesPage } = await import('./ValuesPage');

const renderPage = (canManage: boolean) =>
  renderWithProviders(<ValuesPage settings={{ referralCommissionBps: 300 }} canManage={canManage} />);

describe('Personalização > Valores', () => {
  it('Gerente altera o percentual do "Indique e ganhe"; sem a prévia nem o fechamento do mês', () => {
    renderPage(true);
    expect(screen.getByRole('heading', { level: 2, name: 'Indique e ganhe' })).toBeInTheDocument();
    expect(screen.getByLabelText('Percentual (%)')).toHaveValue('3');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fechar mês' })).toBeNull();
    expect(screen.queryByText('Meses fechados')).toBeNull();
  });

  it('Financeiro só vê o percentual', () => {
    renderPage(false);
    expect(screen.getByText(/Percentual atual/)).toHaveTextContent('Percentual atual: 3%');
    expect(screen.queryByLabelText('Percentual (%)')).toBeNull();
  });
});
