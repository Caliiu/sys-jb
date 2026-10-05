import type { CasinoLobby as Lobby } from '@sysjb/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadCasinoGamesAction = vi.fn();
const router = { replace: vi.fn(), push: vi.fn() };

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/app/casino-actions', () => ({
  loadCasinoGamesAction: (...args: unknown[]) => loadCasinoGamesAction(...args),
}));

const { default: CasinoLobby } = await import('./CasinoLobby');
const { default: CasinoGameScreen } = await import('./CasinoGameScreen');

const USER = '00000000-0000-4000-8000-000000000001';
const card = (id: number, provider = 'PGSOFT') => ({
  id,
  name: `Fortune Sintético ${id}`,
  provider,
  imageUrl: `https://cdn.example.test/${id}.png`,
});

const LOBBY: Lobby = {
  available: true,
  sections: [
    { provider: 'PGSOFT', total: 20, games: [card(1), card(2)] },
    { provider: 'Evolution', total: 1, games: [card(3, 'Evolution')] },
  ],
  topWins: [{ playerLabel: 'Gustavo***27', game: card(1), winCents: 10300 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.scrollTo = vi.fn();
});
afterEach(() => vi.useRealTimers());

describe('lobby do cassino', () => {
  it('mostra o saldo de games, Top ganhos e as faixas por provedor; "Ver todos" só onde há mais', () => {
    render(<CasinoLobby lobby={LOBBY} balanceCents={12345} userId={USER} />);
    expect(screen.getByLabelText('Saldo do cassino R$ 123,45')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Recarga Pix/ })).toHaveAttribute('href', '/recarga-pix');
    const top = screen.getByRole('heading', { name: 'Top ganhos' }).closest('section')!;
    expect(within(top).getByText('Gustavo***27')).toBeInTheDocument();
    expect(within(top).getByText('R$ 103,00')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Fortune Sintético 1' })[0]).toHaveAttribute('href', '/cassino/jogo/1');
    expect(screen.getByRole('button', { name: 'Ver todos os jogos de PGSOFT' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver todos os jogos de Evolution' })).not.toBeInTheDocument();
  });

  it('favorita no aparelho e mostra o filtro Favoritos', async () => {
    const user = userEvent.setup();
    render(<CasinoLobby lobby={LOBBY} balanceCents={0} userId={USER} />);
    expect(screen.queryByRole('button', { name: /Favoritos/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Favoritar Fortune Sintético 3' }));
    expect(JSON.parse(window.localStorage.getItem(`sysjb:casino-favorites:${USER}`)!)).toEqual([card(3, 'Evolution')]);
    await user.click(screen.getByRole('button', { name: /Favoritos/ }));
    expect(screen.getByRole('button', { name: 'Remover Fortune Sintético 3 dos favoritos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('"Ver todos" carrega o provedor aos poucos', async () => {
    const user = userEvent.setup();
    loadCasinoGamesAction
      .mockResolvedValueOnce({
        ok: true,
        page: { items: [card(1), card(2)], page: 1, pageSize: 2, total: 3, totalPages: 2 },
      })
      .mockResolvedValueOnce({ ok: true, page: { items: [card(4)], page: 2, pageSize: 2, total: 3, totalPages: 2 } });
    render(<CasinoLobby lobby={LOBBY} balanceCents={0} userId={USER} />);
    await user.click(screen.getByRole('button', { name: 'Ver todos os jogos de PGSOFT' }));
    expect(loadCasinoGamesAction).toHaveBeenCalledWith({ provider: 'PGSOFT', page: 1 });
    await user.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(loadCasinoGamesAction).toHaveBeenLastCalledWith({ provider: 'PGSOFT', page: 2 });
    expect(await screen.findByRole('link', { name: 'Fortune Sintético 4' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('busca espera a digitação e mostra "Nenhum jogo encontrado"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    loadCasinoGamesAction.mockResolvedValue({
      ok: true,
      page: { items: [], page: 1, pageSize: 30, total: 0, totalPages: 1 },
    });
    render(<CasinoLobby lobby={LOBBY} balanceCents={0} userId={USER} />);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar por jogo ou provedor' }), 'tig');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(loadCasinoGamesAction).toHaveBeenCalledTimes(1);
    expect(loadCasinoGamesAction).toHaveBeenCalledWith({ search: 'tig', page: 1 });
    expect(await screen.findByText('Nenhum jogo encontrado.')).toBeInTheDocument();
  });

  it('sessão encerrada leva ao login', async () => {
    const user = userEvent.setup();
    loadCasinoGamesAction.mockResolvedValue({ ok: false, code: 'SESSION_INVALID', message: 'x' });
    render(<CasinoLobby lobby={LOBBY} balanceCents={0} userId={USER} />);
    await user.click(screen.getByRole('button', { name: 'Ver todos os jogos de PGSOFT' }));
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });

  it('cassino desligado ou fora do ar avisa', () => {
    const { rerender } = render(
      <CasinoLobby lobby={{ available: false, sections: [], topWins: [] }} balanceCents={0} userId={USER} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Cassino indisponível no momento.');
    rerender(<CasinoLobby lobby={null} balanceCents={0} userId={USER} />);
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível carregar o cassino.');
  });
});

describe('tela do jogo', () => {
  it('jogo num iframe isolado, sem navegar a nossa página; Sair volta ao lobby', () => {
    render(<CasinoGameScreen launch={{ game: card(1), launchUrl: 'https://games.example.test/l?t=1' }} />);
    expect(screen.getByRole('heading', { name: 'Fortune Sintético 1' })).toBeInTheDocument();
    const frame = screen.getByTitle('Fortune Sintético 1');
    expect(frame).toHaveAttribute('src', 'https://games.example.test/l?t=1');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(screen.getByRole('link', { name: 'Sair' })).toHaveAttribute('href', '/cassino');
  });

  it('provedor fora do ar: avisa e oferece voltar', () => {
    render(<CasinoGameScreen launch={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível abrir o jogo agora.');
  });
});
