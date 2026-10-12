import type { AdminPromoterListItem, AdminUserDetail } from '@sysjb/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

const actions = {
  setPromoterAction: vi.fn(),
  removePromoterAction: vi.fn(),
  adminLogoutAction: vi.fn(),
  updateUserAction: vi.fn(),
  setUserStatusAction: vi.fn(),
};

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/usuarios' }));
vi.mock('@/app/admin/actions', () => ({
  setPromoterAction: (...args: unknown[]) => actions.setPromoterAction(...args),
  removePromoterAction: (...args: unknown[]) => actions.removePromoterAction(...args),
  adminLogoutAction: (...args: unknown[]) => actions.adminLogoutAction(...args),
  updateUserAction: (...args: unknown[]) => actions.updateUserAction(...args),
  setUserStatusAction: (...args: unknown[]) => actions.setUserStatusAction(...args),
}));

const { default: UserDetailPage } = await import('./UserDetailPage');

const ID_ANA = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';
const ID_BRUNO = '7c1a4d4f-5e2d-4c74-8b4b-1d2a3f4e5b6c';

const promoter = (over: Partial<AdminPromoterListItem> = {}): AdminPromoterListItem => ({
  id: ID_ANA,
  displayId: 100002,
  name: 'Ana Souza Lima',
  phone: '11912345678',
  inviteCode: 'P5R3M',
  status: 'ACTIVE',
  commissionBps: 1250,
  casinoCommissionBps: 0,
  referralsCount: 3,
  createdAt: '2026-09-25T17:30:00.000Z',
  ...over,
});
const userDetail = (over: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
  id: ID_ANA,
  displayId: 100002,
  name: 'Ana Souza Lima',
  email: null,
  phone: '11912345678',
  document: '52998224725',
  birthDate: '1990-05-17',
  inviteCode: 'CDYGE',
  status: 'ACTIVE',
  createdAt: '2026-09-25T17:30:00.000Z',
  lastLoginAt: null,
  wallet: {
    balanceJb: 0,
    bonusJb: 0,
    prizesJb: 0,
    balanceGames: 0,
    bonusGames: 0,
    prizesGames: 0,
    withdrawable: 0,
    totalAvailableJb: 0,
    totalAvailableGames: 0,
  },
  promoterCommissionBps: null,
  casinoCommissionBps: 0,
  referredBy: null,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('promotor no detalhe do usuário', () => {
  const renderUser = (user: AdminUserDetail, canReadPromoters: boolean, canManagePromoters: boolean) =>
    renderWithProviders(
      <UserDetailPage
        user={user}
        canEdit
        canChangeStatus
        canReadPromoters={canReadPromoters}
        canManagePromoters={canManagePromoters}
      />,
    );

  it('quem gerencia transforma o usuário em promotor definindo a comissão', async () => {
    const ui = userEvent.setup();
    actions.setPromoterAction.mockResolvedValue({ ok: true, data: promoter({ commissionBps: 1000 }) });
    renderUser(userDetail(), true, true);

    expect(screen.getByText('Não é promotor')).toBeInTheDocument();
    expect(screen.getByText('Ninguém (cadastro sem convite)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover promotor' })).toBeNull();
    await ui.type(screen.getByLabelText('Loterias (%)'), '10');
    // Cassino começa em 0% (sem comissão de cassino).
    expect(screen.getByLabelText('Cassino (% do GGR)')).toHaveValue('0');
    await ui.click(screen.getByRole('button', { name: 'Tornar promotor' }));
    expect(actions.setPromoterAction).toHaveBeenCalledExactlyOnceWith(ID_ANA, 1000, 0);
  });

  it('promotor: mostra as comissões e permite alterar (inclusive a de cassino) e remover', async () => {
    const ui = userEvent.setup();
    actions.setPromoterAction.mockResolvedValue({ ok: true, data: promoter({ casinoCommissionBps: 2000 }) });
    renderUser(userDetail({ promoterCommissionBps: 1250, casinoCommissionBps: 500 }), true, true);
    expect(screen.getByText('Promotor · comissão de 12,5% · cassino de 5%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover promotor' })).toBeInTheDocument();

    const casino = screen.getByLabelText('Cassino (% do GGR)');
    expect(casino).toHaveValue('5');
    await ui.clear(casino);
    await ui.type(casino, '120');
    await ui.click(screen.getByRole('button', { name: 'Salvar comissões' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Cassino: entre 0% e 100% do GGR');
    expect(actions.setPromoterAction).not.toHaveBeenCalled();

    await ui.clear(casino);
    await ui.type(casino, '20');
    await ui.click(screen.getByRole('button', { name: 'Salvar comissões' }));
    expect(actions.setPromoterAction).toHaveBeenCalledExactlyOnceWith(ID_ANA, 1250, 2000);
  });

  it('indicado por um promotor: "Indicado por" (link para a unidade) e "Promotor do jogador" separados', () => {
    const user = userDetail({
      referredBy: { id: ID_BRUNO, displayId: 100003, name: 'Bruno Alves', promoterCommissionBps: 700 },
    });
    const { unmount } = renderUser(user, true, false);
    expect(screen.getByRole('link', { name: 'Bruno Alves (ID 100003)' })).toHaveAttribute(
      'href',
      `/usuarios/${ID_BRUNO}`,
    );
    expect(screen.getByText('Bruno Alves · comissão de 7%')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /comissão de 7%/ })).toBeNull();
    // Sem permissão de gerenciar, não há controles de promotor.
    expect(screen.queryByLabelText('Loterias (%)')).toBeNull();
    unmount();

    renderUser(user, false, false);
    expect(screen.getByText('Bruno Alves · comissão de 7%')).toBeInTheDocument();
  });

  it('indicado por um jogador comum: só indicação, sem promotor', () => {
    renderUser(
      userDetail({ referredBy: { id: ID_BRUNO, displayId: 100003, name: 'Bruno Alves', promoterCommissionBps: null } }),
      true,
      false,
    );
    expect(screen.getByRole('link', { name: 'Bruno Alves (ID 100003)' })).toBeInTheDocument();
    expect(screen.getByText('Nenhum (quem indicou não é promotor)')).toBeInTheDocument();
  });

  it('perfil sem acesso a promotores e usuário sem indicação: a seção nem aparece', () => {
    renderUser(userDetail(), false, false);
    expect(screen.queryByRole('heading', { name: 'Indicação e promotor' })).toBeNull();
  });
});
