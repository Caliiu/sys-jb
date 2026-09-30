import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resultsReceipt } from '@/lib/results-receipt';
import { TEST_SCHEDULE, testDraw } from '@/test/draws';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/resultados' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
const openReceiptPdf = vi.fn();
vi.mock('@/lib/receipt-pdf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/receipt-pdf')>()),
  openReceiptPdf: (...args: unknown[]) => openReceiptPdf(...args),
}));

const { default: ResultsScreen } = await import('./ResultsScreen');
const { default: ResultsDrawsScreen } = await import('./ResultsDrawsScreen');
const { InviteProvider } = await import('../dashboard/InviteProvider');

const withInvite = (children: React.ReactNode) => <InviteProvider inviteCode="CDYGE">{children}</InviteProvider>;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('Resultado loterias: escolha das extrações', () => {
  const draws = TEST_SCHEDULE.draws;
  const rio09 = testDraw('LT PT RIO 09HS');
  const federal = testDraw('LT FEDERAL');

  it('lista os grupos fechados com contador; abrir mostra as extrações para marcar', async () => {
    const ui = userEvent.setup();
    renderWithProviders(withInvite(<ResultsDrawsScreen date="2026-09-30" draws={draws} initialSelected={[]} />));
    expect(screen.getByRole('heading', { name: 'Loterias' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Loterias' });
    expect(
      within(list)
        .getAllByRole('button', { expanded: false })
        .map((b) => b.textContent),
    ).toEqual(['RIO/FEDERAL0', 'NACIONAL0', 'BAHIA0', 'CAPITAL0']);
    expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled();

    await ui.click(screen.getByRole('button', { name: /^RIO\/FEDERAL/ }));
    const panel = screen.getByRole('list', { name: 'Extrações RIO/FEDERAL' });
    await ui.click(within(panel).getByRole('checkbox', { name: 'LT FEDERAL' }));
    await ui.click(within(panel).getByRole('checkbox', { name: 'LT PT RIO 09HS' }));
    expect(screen.getByLabelText('2 escolhidas')).toBeInTheDocument();
    // Sem horário de venda (isso é da compra).
    expect(within(panel).queryByText('09:18')).toBeNull();

    // Avançar leva ao resultado na ordem do cadastro, não na do toque.
    await ui.click(screen.getByRole('button', { name: 'Avançar' }));
    expect(router.push).toHaveBeenCalledExactlyOnceWith(
      `/resultados/loterias/2026-09-30/resultado?sorteios=${rio09.id},${federal.id}`,
    );
  });

  it('volta marcada (ignorando id que não corre no dia) e desmarcar tira da escolha', async () => {
    const ui = userEvent.setup();
    renderWithProviders(
      withInvite(<ResultsDrawsScreen date="2026-09-30" draws={draws} initialSelected={[rio09.id, 'outro-id']} />),
    );
    expect(screen.getByLabelText('1 escolhida')).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: /^RIO\/FEDERAL/ }));
    await ui.click(screen.getByRole('checkbox', { name: 'LT PT RIO 09HS' }));
    expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled();
  });

  it('favoritar sobe o grupo para o topo (a mesma lista de favoritos da compra)', async () => {
    const ui = userEvent.setup();
    renderWithProviders(withInvite(<ResultsDrawsScreen date="2026-09-30" draws={draws} initialSelected={[]} />));
    await ui.click(screen.getByRole('button', { name: 'Favoritar BAHIA' }));
    const groups = within(screen.getByRole('list', { name: 'Loterias' })).getAllByRole('listitem');
    expect(groups[0]).toHaveTextContent('BAHIA');
    expect(JSON.parse(window.localStorage.getItem('sysjb:lottery-favorites')!)).toEqual(['BAHIA']);
  });

  it('dia sem loterias avisa', () => {
    renderWithProviders(withInvite(<ResultsDrawsScreen date="2026-09-30" draws={[]} initialSelected={[]} />));
    expect(screen.getByText('Não há loterias neste dia.')).toBeInTheDocument();
  });
});

describe('Resultado loterias: resultado', () => {
  const base = { date: '2026-09-30', sellerId: 1366864, consultedAt: '30/09/2026 09:34:40' };

  it('comprovante: vendedor, data/hora, "Resultados" e cada extração com número, grupo e bicho', async () => {
    const receipt = resultsReceipt({
      ...base,
      results: [{ drawName: 'LT PT RIO 09HS', prizes: ['7977', '5765', '2942', '6262', '2545', '5491', '0987'] }],
    });
    renderWithProviders(withInvite(<ResultsScreen backHref="/resultados/loterias/2026-09-30" receipt={receipt} />));
    expect(screen.getByRole('heading', { name: 'Resultados' })).toBeInTheDocument();
    expect(screen.getByText('VENDEDOR: 1366864')).toBeInTheDocument();
    expect(screen.getByText('30/09/2026 09:34:40')).toBeInTheDocument();
    expect(screen.getByText('30/09/2026')).toBeInTheDocument();
    expect(screen.getByText('LT PT RIO 09HS')).toBeInTheDocument();
    expect(screen.getByText('7.977 G.20')).toBeInTheDocument();
    expect(screen.getByText('Peru').tagName).toBe('STRONG');
    expect(screen.getByText('987 G.22')).toBeInTheDocument();
    expect(screen.getByText('Tigre')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para as loterias' })).toHaveAttribute(
      'href',
      '/resultados/loterias/2026-09-30',
    );

    await userEvent.click(screen.getByRole('button', { name: /Compartilhar/ }));
    expect(openReceiptPdf).toHaveBeenCalledWith(expect.anything(), receipt);
  });

  it('nenhuma extração escolhida com resultado: o aviso', () => {
    renderWithProviders(withInvite(<ResultsScreen backHref="/x" receipt={resultsReceipt({ ...base, results: [] })} />));
    expect(screen.getByText('Não há resultado na data')).toBeInTheDocument();
  });
});
