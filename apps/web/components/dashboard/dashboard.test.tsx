import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router, user } from '@/test/render';

const auth = { register: vi.fn(), login: vi.fn(), logout: vi.fn() };
const meAction = vi.fn();
const openInvite = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/app/auth-actions', () => ({ meAction: (...args: unknown[]) => meAction(...args) }));

const { default: SideMenu } = await import('./SideMenu');
const { default: InviteModal } = await import('./InviteModal');
const { default: SorteioBanner } = await import('./SorteioBanner');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SideMenu', () => {
  it('fechado fica inert (fora do teclado e de leitores de tela)', () => {
    renderWithProviders(<SideMenu id="menu" open={false} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.closest('[inert]')).not.toBeNull();
  });

  it('aberto: foco no primeiro item, Esc fecha, trava a rolagem da página', async () => {
    const onClose = vi.fn();
    renderWithProviders(<SideMenu id="menu" open onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog.closest('[inert]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Início' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('item sem página avisa "em breve"; Início navega; Sair encerra a sessão', async () => {
    const onClose = vi.fn();
    renderWithProviders(<SideMenu id="menu" open onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Perfil' }));
    expect(screen.getByRole('status')).toHaveTextContent('Perfil: disponível em breve.');

    await userEvent.click(screen.getByRole('button', { name: 'Início' }));
    expect(router.push).toHaveBeenCalledWith('/');

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(auth.logout).toHaveBeenCalledOnce();
    expect(router.replace).toHaveBeenCalledWith('/login');
  });
});

describe('InviteModal', () => {
  it('mostra link da banca e QR real; cópia bem-sucedida', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithProviders(<InviteModal open onClose={vi.fn()} inviteCode="100042" />);

    const link = screen.getByRole('textbox', { name: 'Link de convite' });
    expect(link).toHaveValue(`${window.location.origin}/cadastro?convite=100042`);
    expect(screen.getByRole('img', { name: 'QR code do link de convite' }).querySelector('path')).toHaveAttribute('d');
    expect(screen.queryByText(/1%/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/cadastro?convite=100042`);
    expect(screen.getByText('Link copiado!')).toBeInTheDocument();
  });

  it('falha ao copiar não quebra: seleciona o link e orienta a cópia manual', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('negado')) },
      configurable: true,
    });
    renderWithProviders(<InviteModal open onClose={vi.fn()} inviteCode="100042" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
    expect(screen.getByText(/Copie o link selecionado/)).toBeInTheDocument();
  });

  it('cancelar o compartilhamento não é tratado como erro', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new DOMException('cancelado', 'AbortError')),
      configurable: true,
    });
    renderWithProviders(<InviteModal open onClose={vi.fn()} inviteCode="100042" />);
    await userEvent.click(screen.getByRole('button', { name: /Compartilhar/ }));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('Esc e o botão Fechar chamam onClose', async () => {
    const onClose = vi.fn();
    renderWithProviders(<InviteModal open onClose={onClose} inviteCode="100042" />);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('BalanceCard', () => {
  vi.doMock('./InviteProvider', () => ({ useInvite: () => ({ openInvite }) }));

  async function renderCard() {
    const { default: BalanceCard } = await import('./BalanceCard');
    return renderWithProviders(<BalanceCard initialWallet={user.wallet} />);
  }

  it('mostra saldo, bônus e games formatados; ocultar esconde os valores', async () => {
    await renderCard();
    const card = screen.getByRole('region', { name: 'Saldo' });
    expect(within(card).getByText('1.235,00')).toBeInTheDocument(); // 123456 + 44 centavos
    expect(within(card).getByText('BÔNUS + R$ 5,00')).toBeInTheDocument();
    expect(within(card).getByText('R$ 10,00')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar saldo' }));
    expect(within(card).queryByText('1.235,00')).toBeNull();
    expect(within(card).getAllByText(/••••/).length).toBeGreaterThan(0);
  });

  it('falha ao atualizar mostra "—" (nunca 0,00) e oferece nova tentativa', async () => {
    meAction.mockResolvedValue({ ok: false, status: 503, code: 'INTERNAL_ERROR', message: 'x' });
    await renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar saldo' }));
    expect(screen.getByText(/Não foi possível carregar seu saldo/)).toBeInTheDocument();
    expect(screen.queryByText('0,00')).toBeNull();
  });

  it('sessão expirada leva ao login', async () => {
    meAction.mockResolvedValue({ ok: false, status: 401, code: 'SESSION_INVALID', message: 'x' });
    await renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar saldo' }));
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('o botão de convite abre o convite', async () => {
    await renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Ganhe convidando seus amigos' }));
    expect(openInvite).toHaveBeenCalledOnce();
  });
});

describe('SorteioBanner', () => {
  it('sem sorteio cadastrado, não aparece', () => {
    const { container } = renderWithProviders(<SorteioBanner draw={null} />);
    expect(container.querySelector('time')).toBeNull();
  });

  it('com sorteio, conta regressivamente em tempo real', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
    renderWithProviders(<SorteioBanner draw={{ label: 'LT TESTE 13HS', startsAt: '2026-09-25T13:00:00Z' }} />);
    expect(screen.getByText('LT TESTE 13HS')).toBeInTheDocument();
    expect(screen.getByText('01:00:00')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('00:59:57')).toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe('Toast', () => {
  it('some sozinho depois de alguns segundos', () => {
    vi.useFakeTimers();
    renderWithProviders(<SideMenu id="menu" open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Loterias' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loterias: disponível em breve.');
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    vi.useRealTimers();
  });
});
