import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type PlaceFazendinhaBetResponse, defaultQuotes } from '@sysjb/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoldMap } from '@/lib/fazendinha';
import { TEST_SCHEDULE } from '@/test/draws';
import { renderWithProviders, router, tenant, user } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/app/auth-actions', () => ({ meAction: vi.fn() }));
vi.mock('@/app/fazendinha-actions', () => ({
  placeFazendinhaBetAction: vi.fn(),
  fazendinhaSoldAction: vi.fn(),
}));

const actions = await import('@/app/fazendinha-actions');
const { default: FazendinhaPage } = await import('./FazendinhaPage');

// 28/09/2026 10:30 em Brasília.
const NOW = '2026-09-28T13:30:00.000Z';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(actions.fazendinhaSoldAction).mockResolvedValue([]);
});

function renderPage(initialSold: SoldMap = {}) {
  return renderWithProviders(
    <FazendinhaPage
      tenant={tenant}
      user={user}
      nowIso={NOW}
      initialSold={initialSold}
      quotes={defaultQuotes().fazendinha}
      schedule={TEST_SCHEDULE}
    />,
  );
}

async function openStake(lottery: string, index = 0) {
  await userEvent.click(screen.getByRole('button', { name: lottery }));
  const list = screen.getByRole('list', { name: `Cotações ${lottery}` });
  await userEvent.click(within(list).getAllByRole('button')[index]!);
}

describe('FazendinhaPage', () => {
  it('título, dia atual e só extrações futuras', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Fazendinha' })).toBeInTheDocument();
    expect(screen.getByText('Hoje - 28/09')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dia anterior' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'LT PT RIO 09HS' })).toBeNull();
    expect(screen.getByRole('button', { name: 'LT PT RIO 11HS' })).toBeInTheDocument();
  });

  it('próximo dia mostra todas as extrações e busca os vendidos daquele dia', async () => {
    renderPage();
    expect(actions.fazendinhaSoldAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Próximo dia' }));
    expect(screen.getByText('Amanhã - 29/09')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'LT PT RIO 09HS' })).toBeInTheDocument();
    expect(actions.fazendinhaSoldAction).toHaveBeenCalledExactlyOnceWith('2026-09-29');
  });

  it('página aberta além da meia-noite: "Hoje" vira o novo dia e a compra vai com a data mostrada', async () => {
    // Relógio do aparelho errado (2020): só o tempo decorrido conta.
    const deviceStart = Date.parse('2020-01-01T00:00:00Z');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(deviceStart);
    try {
      vi.mocked(actions.placeFazendinhaBetAction).mockResolvedValue({
        ok: false,
        code: 'INSUFFICIENT_FUNDS',
        message: 'Saldo indisponível',
      });
      renderPage();
      expect(screen.getByText('Hoje - 28/09')).toBeInTheDocument();
      // Passaram 14 horas: 00:30 de 29/09 em Brasília. A lista atualiza ao mexer na tela.
      clock.mockReturnValue(deviceStart + 14 * 60 * 60 * 1000);
      await userEvent.type(screen.getByRole('searchbox', { name: 'Pesquisar loteria' }), 'rio');
      await userEvent.click(screen.getByRole('button', { name: 'Próximo dia' }));
      await userEvent.click(screen.getByRole('button', { name: 'Dia anterior' }));
      expect(screen.getByText('Hoje - 29/09')).toBeInTheDocument();
      expect(actions.fazendinhaSoldAction).toHaveBeenCalledWith('2026-09-29');

      await openStake('LT PT RIO 09HS');
      expect(screen.getByRole('region', { name: 'Aposta' })).toHaveTextContent(/Hoje - 29\/09/);
      await userEvent.click(screen.getByRole('button', { name: '04 Borboleta' }));
      await userEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
      expect(actions.placeFazendinhaBetAction).toHaveBeenCalledWith(
        expect.objectContaining({ drawDate: '2026-09-29', lottery: 'LT PT RIO 09HS' }),
      );
    } finally {
      clock.mockRestore();
    }
  });

  it('cotações da modalidade escolhida, descontando os números vendidos', async () => {
    renderPage({ 'LT PT RIO 11HS|11|grupo|100': [1, 2, 3] });
    await userEvent.click(screen.getByRole('button', { name: 'LT PT RIO 11HS' }));
    const items = () => within(screen.getByRole('list', { name: 'Cotações LT PT RIO 11HS' })).getAllByRole('listitem');
    expect(items()[0]).toHaveTextContent(/R\$ 1,00.*R\$ 22,00.*GRUPO.*22 números restantes/);
    expect(items()[1]).toHaveTextContent(/25 números restantes/);

    // Barra de progresso: vendidos / total (3 de 25 = 12%); sem vendas, vazia.
    const [first, second] = items().map((item) => within(item).getByRole('progressbar', { name: 'Números vendidos' }));
    expect(first).toHaveAttribute('aria-valuenow', '3');
    expect(first).toHaveAttribute('aria-valuemax', '25');
    expect(first!.firstElementChild).toHaveStyle({ width: '12%' });
    expect(second!.firstElementChild).toHaveStyle({ width: '0%' });

    await userEvent.click(screen.getByRole('button', { name: 'CENTENA' }));
    expect(screen.getByRole('button', { name: 'CENTENA' })).toHaveAttribute('aria-pressed', 'true');
    expect(items()[0]).toHaveTextContent(/R\$ 880,00.*CENTENA.*1000 números restantes/);
  });

  it('cotação abre os palpites sem sair da página; voltar mantém a modalidade', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'DEZENA' }));
    await openStake('LT BAHIA 12HS', 1);

    expect(screen.getByRole('heading', { level: 1, name: 'Palpites' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Aposta' })).toHaveTextContent(
      /R\$ 3,00\s*pra\s*R\$ 264,00.*Hoje - 28\/09.*LT BAHIA 12HS.*DEZENA/,
    );
    expect(router.push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Voltar à Fazendinha' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Fazendinha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DEZENA' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('compra: comprovante, saldo atualizado e os números viram indisponíveis', async () => {
    const response: PlaceFazendinhaBetResponse = {
      bet: {
        puleNumber: 562229026,
        drawDate: '2026-09-28',
        lottery: 'LT PT RIO 11HS',
        hour: 11,
        mode: 'grupo',
        stakeCents: 100,
        prizeCents: 2200,
        quoteTable: '800/1/8000',
        numbers: [4, 5],
        totalCents: 200,
        createdAt: '2026-09-28T12:01:14.000Z',
        sellerId: user.displayId,
      },
      wallet: { ...user.wallet, balanceJb: 123256 },
    };
    vi.mocked(actions.placeFazendinhaBetAction).mockResolvedValue({ ok: true, data: response });
    renderPage();
    await openStake('LT PT RIO 11HS');
    await userEvent.click(screen.getByRole('button', { name: '04 Borboleta' }));
    await userEvent.click(screen.getByRole('button', { name: '05 Cachorro' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(actions.placeFazendinhaBetAction).toHaveBeenCalledExactlyOnceWith({
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      drawDate: '2026-09-28',
      lottery: 'LT PT RIO 11HS',
      hour: 11,
      mode: 'grupo',
      stakeCents: 100,
      prizeCents: 2200,
      numbers: [4, 5],
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Sucesso' })).toBeInTheDocument();
    const receipt = screen.getByRole('main');
    expect(receipt).toHaveTextContent(`VENDEDOR: ${user.displayId}`);
    expect(receipt).toHaveTextContent('28/09/2026 9:01:14');
    expect(receipt).toHaveTextContent(/VALE\s*28\/09\/2026/);
    expect(receipt).toHaveTextContent(/LT PT RIO 11HS\s*#562229026/);
    expect(receipt).toHaveTextContent('FAZENDINHA GP');
    expect(within(receipt).getByLabelText('Palpites')).toHaveTextContent(/04\s+05/);
    expect(receipt).toHaveTextContent('R$ 1,00 / CADA');
    expect(receipt).toHaveTextContent('TOTAL JOGO: R$ 2,00');
    expect(screen.getByRole('button', { name: 'Ocultar saldo' })).toHaveTextContent('1.233,00');

    await userEvent.click(screen.getByRole('button', { name: 'Nova aposta' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Fazendinha' })).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('list', { name: 'Cotações LT PT RIO 11HS' })).getAllByRole('button')[0]!,
    );
    expect(screen.getByRole('button', { name: '04 Borboleta (indisponível)' })).toBeDisabled();
  });

  it('busca filtra e avisa quando não encontra; só sorteios da Fazendinha e do dia', async () => {
    renderPage();
    const names = () =>
      screen
        .queryAllByRole('button', { expanded: false })
        .map((b) => b.textContent)
        .filter((name) => name?.startsWith('LT '));
    // Capital é só Loterias; Federal não corre na segunda.
    expect(names()).not.toContain('LT CAPITAL 13HS');
    expect(names()).not.toContain('LT FEDERAL');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Pesquisar loteria' }), ' bahia 12 ');
    expect(names()).toEqual(['LT BAHIA 12HS']);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Pesquisar loteria' }), 'xyz');
    expect(screen.getByText('Nenhuma loteria encontrada.')).toBeInTheDocument();
  });

  it('saldo pode ser ocultado', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar saldo' }));
    expect(screen.getByRole('button', { name: 'Mostrar saldo' })).toHaveTextContent('••••');
  });
});
