import type { AdminCasinoClosing, CasinoClosingRow } from '@sysjb/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

const payCasinoClosingAction = vi.fn();
vi.mock('@/app/admin/actions', () => ({
  payCasinoClosingAction: (...args: unknown[]) => payCasinoClosingAction(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/relatorios/cassino/fechamento',
}));

const { default: CasinoClosingPage } = await import('./CasinoClosingPage');

const ZERO = { turnoverCents: 0, payoutCents: 0, ggrCents: 0, commissionCents: 0 };
const NOTHING = { paidCents: 0, pendingCents: 0, pendingCount: 0 };
const BIA = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';
const ANA = '6c1f4d4f-5e2d-4c74-8b4b-1d2f3e4d5a6c';

const row = (extra: Partial<CasinoClosingRow> & Pick<CasinoClosingRow, 'promoter'>): CasinoClosingRow => ({
  casinoCommissionBps: 2500,
  referralsCount: 2,
  ...ZERO,
  status: 'none',
  paidAt: null,
  ...extra,
});

const BASE: AdminCasinoClosing = {
  months: [
    {
      month: '2026-09',
      ended: true,
      totals: { turnoverCents: 17_001, payoutCents: 6_000, ggrCents: 11_001, commissionCents: 3_500 },
      promotersWithCommission: 1,
      paidCents: 0,
      pendingCents: 3_500,
      pendingCount: 1,
    },
    { month: '2026-10', ended: false, totals: ZERO, promotersWithCommission: 0, ...NOTHING },
  ],
  detail: null,
};

const DETAIL: AdminCasinoClosing = {
  ...BASE,
  detail: {
    month: '2026-09',
    ended: true,
    rows: [
      row({
        promoter: { id: ANA, displayId: 100001, name: 'Ana Promotora' },
        casinoCommissionBps: 1250,
        turnoverCents: 1_000,
        payoutCents: 4_000,
        ggrCents: -3_000,
      }),
      row({
        promoter: { id: BIA, displayId: 100002, name: 'Bia Promotora' },
        turnoverCents: 16_001,
        payoutCents: 2_000,
        ggrCents: 14_001,
        commissionCents: 3_500,
        status: 'pending',
      }),
    ],
    totals: { turnoverCents: 17_001, payoutCents: 6_000, ggrCents: 11_001, commissionCents: 3_500 },
    paidCents: 0,
    pendingCents: 3_500,
    pendingCount: 1,
  },
};

beforeEach(() => vi.clearAllMocks());

describe('Fechamento cassino', () => {
  it('sem mês escolhido: os dois cards e o aviso da referência; "Pagar Todos" desabilitado', () => {
    renderWithProviders(<CasinoClosingPage data={BASE} canPay />);
    expect(screen.getByRole('heading', { level: 1, name: 'Fechamento cassino' })).toBeInTheDocument();

    const previous = screen.getByRole('article', { name: 'Mês anterior: setembro/2026' });
    expect(within(previous).getByText('R$ 170,01')).toBeInTheDocument();
    expect(within(previous).getByText('Comissão do mês')).toBeInTheDocument();
    expect(within(previous).getByText('A pagar: R$ 35,00 (1 promotor)')).toBeInTheDocument();
    expect(within(previous).getByRole('link', { name: 'Visualizar' })).toHaveAttribute(
      'href',
      '/relatorios/cassino/fechamento?mes=2026-09',
    );
    const current = screen.getByRole('article', { name: 'Mês atual: outubro/2026' });
    expect(within(current).getByText('Comissão parcial')).toBeInTheDocument();
    expect(within(current).getByText(/^Mês em andamento/)).toBeInTheDocument();

    const box = screen.getByRole('region', { name: 'Detalhamento por promotor' });
    expect(within(box).getByText('Carregue ou visualize os dados de um mês nos cards acima.')).toBeInTheDocument();
    expect(within(box).getByRole('button', { name: 'Pagar Todos' })).toBeDisabled();
  });

  it('mês escolhido: card marcado, linhas por promotor, total e só o pendente com "Pagar"', () => {
    renderWithProviders(<CasinoClosingPage data={DETAIL} canPay />);
    expect(
      within(screen.getByRole('article', { name: /^Mês anterior/ })).getByRole('link', { name: 'Visualizando' }),
    ).toHaveAttribute('aria-current', 'true');

    const table = screen.getByRole('table', { name: 'Detalhamento por promotor' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['ID', 'Promotor', '% cassino', 'Indicados', 'Turnover', 'Payout', 'GGR', 'Comissão', 'Situação', 'Ações']);
    const [, ana, bia, total] = within(table).getAllByRole('row');
    expect([...ana!.querySelectorAll('td')].map((td) => td.textContent)).toEqual([
      '100001',
      'Ana Promotora',
      '12,5%',
      '2',
      'R$ 10,00',
      'R$ 40,00',
      'R$ -30,00',
      'R$ 0,00',
      'Sem comissão',
      '',
    ]);
    expect(within(ana!).getByRole('link', { name: 'Ana Promotora' })).toHaveAttribute('href', `/usuarios/${ANA}`);
    expect(within(bia!).getByText('A pagar')).toBeInTheDocument();
    expect(within(bia!).getByRole('button', { name: 'Pagar Bia Promotora' })).toBeEnabled();
    expect(within(total!).getByText('R$ 35,00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar Todos' })).toBeEnabled();
  });

  it('sem permissão de pagar (Financeiro): consulta sem botões', () => {
    renderWithProviders(<CasinoClosingPage data={DETAIL} canPay={false} />);
    expect(screen.queryByRole('button', { name: /Pagar/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Ações' })).toBeNull();
  });

  it('mês em andamento: nada a pagar', () => {
    const data: AdminCasinoClosing = {
      ...BASE,
      detail: {
        ...DETAIL.detail!,
        month: '2026-10',
        ended: false,
        rows: DETAIL.detail!.rows.map((item) => ({ ...item, status: 'open' })),
        ...NOTHING,
      },
    };
    renderWithProviders(<CasinoClosingPage data={data} canPay />);
    expect(screen.getByText(/\(em andamento: parcial\)/)).toBeInTheDocument();
    expect(screen.getAllByText('Em andamento').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Pagar Todos' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Pagar Bia/ })).toBeNull();
  });

  it('Pagar Todos: confirma, paga, avisa e recarrega', async () => {
    payCasinoClosingAction.mockResolvedValue({ ok: true, data: { paidCount: 1, paidCents: 3_500 } });
    renderWithProviders(<CasinoClosingPage data={DETAIL} canPay />);
    await userEvent.click(screen.getByRole('button', { name: 'Pagar Todos' }));
    const dialog = screen.getByRole('dialog', { name: 'Pagar todos os promotores?' });
    expect(dialog).toHaveTextContent('R$ 35,00 de comissão de cassino de setembro/2026 vão para o saldo de saque de 1 promotor.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pagar' }));

    expect(payCasinoClosingAction).toHaveBeenCalledWith('2026-09', undefined);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('R$ 35,00 pagos a 1 promotor.')).toHaveAttribute('role', 'status');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('Pagar um promotor; recusa da API aparece no diálogo (e a tela recarrega se já foi pago)', async () => {
    payCasinoClosingAction.mockResolvedValue({
      ok: false,
      code: 'CONFLICT',
      message: 'Nada a pagar para este promotor no mês (já recebeu, está bloqueado ou não tem comissão).',
    });
    renderWithProviders(<CasinoClosingPage data={DETAIL} canPay />);
    const table = screen.getByRole('table', { name: 'Detalhamento por promotor' });
    await userEvent.click(within(table).getByRole('button', { name: 'Pagar Bia Promotora' }));
    const dialog = screen.getByRole('dialog', { name: 'Pagar comissão de cassino?' });
    expect(dialog).toHaveTextContent('para o saldo de saque de Bia Promotora');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pagar' }));

    expect(payCasinoClosingAction).toHaveBeenCalledWith('2026-09', BIA);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/^Nada a pagar/);
    expect(router.refresh).toHaveBeenCalled();
  });
});
