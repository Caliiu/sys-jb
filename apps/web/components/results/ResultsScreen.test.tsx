import type { LotteryResultsResponse } from '@sysjb/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resultsReceipt } from '@/lib/results-receipt';
import { TEST_SCHEDULE, testDraw } from '@/test/draws';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/resultados/loterias' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
const openReceiptPdf = vi.fn();
vi.mock('@/lib/receipt-pdf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/receipt-pdf')>()),
  openReceiptPdf: (...args: unknown[]) => openReceiptPdf(...args),
}));
const loadResultsAction = vi.fn();
vi.mock('@/app/results-actions', () => ({ loadResultsAction: (...args: unknown[]) => loadResultsAction(...args) }));

const { default: ResultsScreen } = await import('./ResultsScreen');
const { default: ResultsDrawsScreen } = await import('./ResultsDrawsScreen');
const { default: ResultsFlow } = await import('./ResultsFlow');
const { InviteProvider } = await import('../dashboard/InviteProvider');

const withInvite = (children: React.ReactNode) => <InviteProvider inviteCode="CDYGE">{children}</InviteProvider>;

// Quarta, 30/09/2026 09:34:40 em Brasília (a Federal corre às quartas).
const NOW = '2026-09-30T12:34:40.000Z';
const rio09 = testDraw('LT PT RIO 09HS');
const federal = testDraw('LT FEDERAL');

const REPORT: LotteryResultsResponse = {
  date: '2026-09-30',
  results: [
    {
      lottery: 'rj',
      lotteryName: 'PT Rio de Janeiro',
      extraction: 9,
      prizes: ['7977', '5765', '2942', '6262', '2545', '5491', '0987'],
      sum: null,
      multiplication: null,
      skipped: null,
      super5: null,
      updatedAt: '2026-09-30T12:30:00.000Z',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/resultados/loterias');
});

describe('Resultado loterias: uma rota só', () => {
  const flow = (start: Parameters<typeof ResultsFlow>[0]['start'] = { step: 'dates' }) =>
    renderWithProviders(
      withInvite(<ResultsFlow nowIso={NOW} schedule={TEST_SCHEDULE} sellerId={1366864} start={start} />),
    );

  it('dia → loterias → resultado sem mudar o endereço; o voltar de cada etapa leva à anterior', async () => {
    const ui = userEvent.setup();
    loadResultsAction.mockResolvedValue({ ok: true, report: REPORT, consultedAt: NOW });
    flow();

    // Dia: hoje e os 7 anteriores.
    expect(screen.getByRole('heading', { name: 'Resultados' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para resultados' })).toHaveAttribute('href', '/resultados');
    const days = within(screen.getByRole('navigation', { name: 'Resultados' })).getAllByRole('button');
    expect(days.map((b) => b.textContent)).toEqual([
      '30/09/2026',
      '29/09/2026',
      '28/09/2026',
      '27/09/2026',
      '26/09/2026',
      '25/09/2026',
      '24/09/2026',
      '23/09/2026',
    ]);

    // Loterias do dia: marca na ordem inversa do cadastro.
    await ui.click(screen.getByRole('button', { name: '30/09/2026' }));
    expect(screen.getByRole('heading', { name: 'Loterias' })).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: /^RIO\/FEDERAL/ }));
    await ui.click(screen.getByRole('checkbox', { name: 'LT FEDERAL' }));
    await ui.click(screen.getByRole('checkbox', { name: 'LT PT RIO 09HS' }));
    await ui.click(screen.getByRole('button', { name: 'Avançar' }));

    // Resultado: só as escolhidas que já têm resultado, com número, grupo e bicho.
    expect(await screen.findByText('7.977 G.20')).toBeInTheDocument();
    expect(loadResultsAction).toHaveBeenCalledExactlyOnceWith('2026-09-30');
    expect(screen.getByRole('heading', { name: 'Resultados' })).toBeInTheDocument();
    expect(screen.getByText('LT PT RIO 09HS')).toBeInTheDocument();
    expect(screen.queryByText('LT FEDERAL')).toBeNull();
    expect(screen.getByText('VENDEDOR: 1366864')).toBeInTheDocument();
    expect(screen.getByText('30/09/2026 09:34:40')).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe('/resultados/loterias');

    await ui.click(screen.getByRole('button', { name: /Compartilhar/ }));
    expect(openReceiptPdf).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Resultados', sellerId: 1366864 }),
    );

    // Voltar: as loterias do dia com as mesmas marcadas; depois, a escolha do dia.
    await ui.click(screen.getByRole('button', { name: 'Voltar para as loterias' }));
    expect(screen.getByRole('heading', { name: 'Loterias' })).toBeInTheDocument();
    expect(screen.getByLabelText('2 escolhidas')).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Voltar para as datas' }));
    expect(screen.getByRole('navigation', { name: 'Resultados' })).toBeInTheDocument();
  });

  it('o link da notificação abre direto no resultado e o endereço fica /resultados/loterias', () => {
    window.history.replaceState(null, '', `/resultados/loterias?data=2026-09-30&sorteios=${rio09.id}`);
    flow({
      step: 'result',
      date: '2026-09-30',
      selected: [rio09.id, federal.id],
      loaded: { report: REPORT, consultedAt: NOW },
    });
    expect(screen.getByText('7.977 G.20')).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe('/resultados/loterias');
  });

  it('falha na consulta avisa e continua nas loterias; sessão encerrada vai para o login', async () => {
    const ui = userEvent.setup();
    flow({ step: 'draws', date: '2026-09-30', selected: [rio09.id] });
    expect(screen.getByLabelText('1 escolhida')).toBeInTheDocument();

    loadResultsAction.mockResolvedValueOnce({
      ok: false,
      code: 'UNAVAILABLE',
      message: 'Não foi possível consultar os resultados. Tente novamente.',
    });
    await ui.click(screen.getByRole('button', { name: 'Avançar' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Não foi possível consultar os resultados. Tente novamente.',
    );
    expect(screen.getByRole('heading', { name: 'Loterias' })).toBeInTheDocument();

    loadResultsAction.mockResolvedValueOnce({ ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada.' });
    await ui.click(screen.getByRole('button', { name: 'Avançar' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });
});

describe('Resultado loterias: escolha das extrações', () => {
  const draws = TEST_SCHEDULE.draws;
  const drawsScreen = (props: Partial<Parameters<typeof ResultsDrawsScreen>[0]> = {}) => {
    const handlers = { onBack: vi.fn(), onConfirm: vi.fn() };
    renderWithProviders(withInvite(<ResultsDrawsScreen draws={draws} initialSelected={[]} {...handlers} {...props} />));
    return handlers;
  };

  it('lista os grupos fechados com contador; Avançar entrega as marcadas na ordem do cadastro', async () => {
    const ui = userEvent.setup();
    const { onConfirm, onBack } = drawsScreen();
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

    await ui.click(screen.getByRole('button', { name: 'Avançar' }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith([rio09.id, federal.id]);
    await ui.click(screen.getByRole('button', { name: 'Voltar para as datas' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('volta marcada (ignorando id que não corre no dia) e desmarcar tira da escolha', async () => {
    const ui = userEvent.setup();
    drawsScreen({ initialSelected: [rio09.id, 'outro-id'] });
    expect(screen.getByLabelText('1 escolhida')).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: /^RIO\/FEDERAL/ }));
    await ui.click(screen.getByRole('checkbox', { name: 'LT PT RIO 09HS' }));
    expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled();
  });

  it('consultando: o botão fica desabilitado', () => {
    drawsScreen({ initialSelected: [rio09.id], busy: true });
    expect(screen.getByRole('button', { name: 'Consultando…' })).toBeDisabled();
  });

  it('favoritar sobe o grupo para o topo (a mesma lista de favoritos da compra)', async () => {
    const ui = userEvent.setup();
    drawsScreen();
    await ui.click(screen.getByRole('button', { name: 'Favoritar BAHIA' }));
    const groups = within(screen.getByRole('list', { name: 'Loterias' })).getAllByRole('listitem');
    expect(groups[0]).toHaveTextContent('BAHIA');
    expect(JSON.parse(window.localStorage.getItem('sysjb:lottery-favorites')!)).toEqual(['BAHIA']);
  });

  it('dia sem loterias avisa', () => {
    drawsScreen({ draws: [] });
    expect(screen.getByText('Não há loterias neste dia.')).toBeInTheDocument();
  });
});

describe('Resultado loterias: resultado', () => {
  const base = { date: '2026-09-30', sellerId: 1366864, consultedAt: '30/09/2026 09:34:40' };

  it('comprovante: vendedor, data/hora, "Resultados" e cada extração com número, grupo e bicho', async () => {
    const onBack = vi.fn();
    const receipt = resultsReceipt({
      ...base,
      results: [{ drawName: 'LT PT RIO 09HS', prizes: ['7977', '5765', '2942', '6262', '2545', '5491', '0987'] }],
    });
    renderWithProviders(
      withInvite(<ResultsScreen back={{ onClick: onBack, label: 'Voltar para as loterias' }} receipt={receipt} />),
    );
    expect(screen.getByRole('heading', { name: 'Resultados' })).toBeInTheDocument();
    expect(screen.getByText('VENDEDOR: 1366864')).toBeInTheDocument();
    expect(screen.getByText('30/09/2026 09:34:40')).toBeInTheDocument();
    expect(screen.getByText('30/09/2026')).toBeInTheDocument();
    expect(screen.getByText('LT PT RIO 09HS')).toBeInTheDocument();
    expect(screen.getByText('7.977 G.20')).toBeInTheDocument();
    expect(screen.getByText('Peru').tagName).toBe('STRONG');
    expect(screen.getByText('0.987 G.22')).toBeInTheDocument();
    expect(screen.getByText('Tigre')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Voltar para as loterias' }));
    expect(onBack).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: /Compartilhar/ }));
    expect(openReceiptPdf).toHaveBeenCalledWith(expect.anything(), receipt);
  });

  it('nenhuma extração escolhida com resultado: o aviso', () => {
    renderWithProviders(
      withInvite(<ResultsScreen back={{ onClick: vi.fn() }} receipt={resultsReceipt({ ...base, results: [] })} />),
    );
    expect(screen.getByText('Não há resultado na data')).toBeInTheDocument();
  });
});
