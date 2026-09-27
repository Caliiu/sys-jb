import type { AdminPromoterListItem, AdminUserDetail, AdminUserListItem, Page } from '@sysjb/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

const actions = {
  setPromoterAction: vi.fn(),
  removePromoterAction: vi.fn(),
  searchUsersAction: vi.fn(),
  adminLogoutAction: vi.fn(),
  updateUserAction: vi.fn(),
  setUserStatusAction: vi.fn(),
};

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/promotores' }));
vi.mock('@/app/admin/actions', () => ({
  setPromoterAction: (...args: unknown[]) => actions.setPromoterAction(...args),
  removePromoterAction: (...args: unknown[]) => actions.removePromoterAction(...args),
  searchUsersAction: (...args: unknown[]) => actions.searchUsersAction(...args),
  adminLogoutAction: (...args: unknown[]) => actions.adminLogoutAction(...args),
  updateUserAction: (...args: unknown[]) => actions.updateUserAction(...args),
  setUserStatusAction: (...args: unknown[]) => actions.setUserStatusAction(...args),
}));

const { default: PromotersPage } = await import('./PromotersPage');
const { default: PromoterDetailPage } = await import('./PromoterDetailPage');
const { default: UserDetailPage } = await import('./UserDetailPage');
const { default: AdminSidebar } = await import('@/components/admin/AdminSidebar');

const ID_ANA = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';
const ID_BRUNO = '7c1a4d4f-5e2d-4c74-8b4b-1d2a3f4e5b6c';

const promoter = (over: Partial<AdminPromoterListItem> = {}): AdminPromoterListItem => ({
  id: ID_ANA,
  displayId: 100002,
  name: 'Ana Souza Lima',
  phone: '11912345678',
  status: 'ACTIVE',
  commissionBps: 1250,
  referralsCount: 3,
  createdAt: '2026-09-25T17:30:00.000Z',
  ...over,
});
const userItem = (over: Partial<AdminUserListItem> = {}): AdminUserListItem => ({
  id: ID_BRUNO,
  displayId: 100003,
  name: 'Bruno Alves',
  document: '52998224725',
  phone: '11987654321',
  status: 'ACTIVE',
  createdAt: '2026-09-26T10:00:00.000Z',
  ...over,
});
const pageOf = <T,>(items: T[], over: Partial<Page<T>> = {}): Page<T> => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  totalPages: 1,
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
  referredBy: null,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('lista de promotores', () => {
  const query = { page: 1, search: '' };

  it('mostra nome (link), telefone, comissão, jogadores e status', () => {
    renderWithProviders(
      <PromotersPage
        query={query}
        result={pageOf([promoter(), promoter({ id: ID_BRUNO, name: 'Bruno', commissionBps: 5 })])}
        canManage={false}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByRole('link', { name: 'Ana Souza Lima' })).toHaveAttribute(
      'href',
      `/promotores/${ID_ANA}`,
    );
    expect(within(rows[0]!).getByText('(11) 91234-5678')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('12,5%')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('3')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Ativo')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('0,05%')).toBeInTheDocument();
  });

  it('sem promotores, mostra o aviso', () => {
    renderWithProviders(<PromotersPage query={query} result={pageOf([])} canManage={false} />);
    expect(screen.getByText('Nenhum promotor encontrado.')).toBeInTheDocument();
  });

  it('busca é um formulário GET; "Limpar" só aparece com busca ativa', () => {
    const { unmount } = renderWithProviders(
      <PromotersPage query={{ page: 1, search: 'ana' }} result={pageOf([])} canManage={false} />,
    );
    expect(screen.getByRole('search')).toHaveAttribute('action', '/promotores');
    expect(screen.getByRole('searchbox', { name: 'Buscar promotores' })).toHaveValue('ana');
    expect(screen.getByRole('link', { name: 'Limpar' })).toHaveAttribute('href', '/promotores');
    unmount();
    renderWithProviders(<PromotersPage query={query} result={pageOf([])} canManage={false} />);
    expect(screen.queryByRole('link', { name: 'Limpar' })).toBeNull();
  });

  it('paginação preserva a busca', () => {
    renderWithProviders(
      <PromotersPage
        query={{ page: 2, search: 'ana' }}
        result={pageOf([promoter()], { page: 2, totalPages: 3, total: 41 })}
        canManage={false}
      />,
    );
    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute('href', '/promotores?search=ana');
    expect(screen.getByRole('link', { name: 'Próxima' })).toHaveAttribute('href', '/promotores?search=ana&page=3');
    expect(screen.getByText(/Página 2 de 3 · 41 promotores/)).toBeInTheDocument();
  });

  it('só quem gerencia vê "Novo promotor"', () => {
    const { unmount } = renderWithProviders(<PromotersPage query={query} result={pageOf([])} canManage />);
    expect(screen.getByRole('button', { name: 'Novo promotor' })).toBeInTheDocument();
    unmount();
    renderWithProviders(<PromotersPage query={query} result={pageOf([])} canManage={false} />);
    expect(screen.queryByRole('button', { name: 'Novo promotor' })).toBeNull();
  });
});

describe('novo promotor', () => {
  async function openAndSearch(ui: ReturnType<typeof userEvent.setup>, results: AdminUserListItem[]) {
    actions.searchUsersAction.mockResolvedValue({ ok: true, data: results });
    renderWithProviders(<PromotersPage query={{ page: 1, search: '' }} result={pageOf([])} canManage />);
    await ui.click(screen.getByRole('button', { name: 'Novo promotor' }));
    await ui.type(screen.getByRole('searchbox', { name: 'Buscar jogador' }), 'bruno');
    await ui.click(
      within(screen.getByRole('search', { name: 'Buscar jogador para promover' })).getByRole('button', {
        name: 'Buscar',
      }),
    );
  }

  it('busca o jogador, seleciona, define a comissão em centésimos de % e atualiza a página', async () => {
    const ui = userEvent.setup();
    actions.setPromoterAction.mockResolvedValue({ ok: true, data: promoter({ id: ID_BRUNO, commissionBps: 1250 }) });
    await openAndSearch(ui, [userItem()]);

    expect(actions.searchUsersAction).toHaveBeenCalledWith('bruno');
    const found = screen.getByRole('list', { name: 'Jogadores encontrados' });
    expect(within(found).getByText('Bruno Alves')).toBeInTheDocument();
    expect(within(found).getByText(/529\.982\.247-25/)).toBeInTheDocument();
    await ui.click(within(found).getByRole('button', { name: 'Selecionar' }));

    await ui.type(screen.getByLabelText('Comissão (%)'), '12,5');
    await ui.click(screen.getByRole('button', { name: 'Tornar promotor' }));
    expect(actions.setPromoterAction).toHaveBeenCalledExactlyOnceWith(ID_BRUNO, 1250);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it('comissão inválida é apontada sem chamar a API', async () => {
    const ui = userEvent.setup();
    await openAndSearch(ui, [userItem()]);
    await ui.click(screen.getByRole('button', { name: 'Selecionar' }));
    for (const bad of ['', '0', '101', '10,555']) {
      await ui.clear(screen.getByLabelText('Comissão (%)'));
      if (bad) await ui.type(screen.getByLabelText('Comissão (%)'), bad);
      await ui.click(screen.getByRole('button', { name: 'Tornar promotor' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Entre 0,01% e 100%');
    }
    expect(actions.setPromoterAction).not.toHaveBeenCalled();
  });

  it('sem resultado avisa; busca curta é recusada sem chamar a API', async () => {
    const ui = userEvent.setup();
    await openAndSearch(ui, []);
    expect(screen.getByText('Nenhum jogador encontrado.')).toBeInTheDocument();

    await ui.clear(screen.getByRole('searchbox', { name: 'Buscar jogador' }));
    await ui.type(screen.getByRole('searchbox', { name: 'Buscar jogador' }), 'a');
    await ui.click(
      within(screen.getByRole('search', { name: 'Buscar jogador para promover' })).getByRole('button', {
        name: 'Buscar',
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('ao menos 2 caracteres');
    expect(actions.searchUsersAction).toHaveBeenCalledTimes(1);
  });

  it('falha da API aparece na tela; sessão encerrada leva ao login', async () => {
    const ui = userEvent.setup();
    actions.setPromoterAction.mockResolvedValueOnce({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Sem permissão para esta ação.',
    });
    await openAndSearch(ui, [userItem()]);
    await ui.click(screen.getByRole('button', { name: 'Selecionar' }));
    await ui.type(screen.getByLabelText('Comissão (%)'), '10');
    await ui.click(screen.getByRole('button', { name: 'Tornar promotor' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Sem permissão para esta ação.');

    actions.setPromoterAction.mockResolvedValueOnce({ ok: false, code: 'SESSION_INVALID', message: 'x' });
    await ui.click(screen.getByRole('button', { name: 'Tornar promotor' }));
    expect(router.replace).toHaveBeenCalledWith('/login');
  });
});

describe('detalhe do promotor', () => {
  it('mostra comissão, código de convite, jogadores indicados e o link do cadastro', () => {
    renderWithProviders(
      <PromoterDetailPage promoter={promoter()} referrals={pageOf([userItem()])} canManage={false} />,
    );
    expect(screen.getByRole('heading', { name: 'Ana Souza Lima' })).toBeInTheDocument();
    expect(screen.getByText('12,5%')).toBeInTheDocument();
    expect(screen.getByText('100002')).toBeInTheDocument(); // código de convite
    expect(screen.getByRole('link', { name: 'Bruno Alves' })).toHaveAttribute('href', `/usuarios/${ID_BRUNO}`);
    expect(screen.getByRole('link', { name: 'Ver cadastro do usuário' })).toHaveAttribute(
      'href',
      `/usuarios/${ID_ANA}`,
    );
    expect(screen.queryByRole('button', { name: /Salvar comissão|Remover promotor/ })).toBeNull();
  });

  it('sem indicados, mostra o aviso; a paginação usa o endereço do promotor', () => {
    const { unmount } = renderWithProviders(
      <PromoterDetailPage promoter={promoter()} referrals={pageOf([])} canManage={false} />,
    );
    expect(screen.getByText(/Nenhum jogador se cadastrou pelo link/)).toBeInTheDocument();
    unmount();
    renderWithProviders(
      <PromoterDetailPage
        promoter={promoter()}
        referrals={pageOf([userItem()], { page: 2, totalPages: 3, total: 41 })}
        canManage={false}
      />,
    );
    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute('href', `/promotores/${ID_ANA}`);
    expect(screen.getByRole('link', { name: 'Próxima' })).toHaveAttribute('href', `/promotores/${ID_ANA}?page=3`);
  });

  it('quem gerencia altera a comissão (só envia se mudou) e a página atualiza', async () => {
    const ui = userEvent.setup();
    actions.setPromoterAction.mockResolvedValue({ ok: true, data: promoter({ commissionBps: 2000 }) });
    renderWithProviders(<PromoterDetailPage promoter={promoter()} referrals={pageOf([])} canManage />);

    const input = screen.getByLabelText('Comissão (%)');
    expect(input).toHaveValue('12,5');
    await ui.click(screen.getByRole('button', { name: 'Salvar comissão' }));
    expect(actions.setPromoterAction).not.toHaveBeenCalled();

    await ui.clear(input);
    await ui.type(input, '20');
    await ui.click(screen.getByRole('button', { name: 'Salvar comissão' }));
    expect(actions.setPromoterAction).toHaveBeenCalledExactlyOnceWith(ID_ANA, 2000);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it('remover pede confirmação, volta para a lista e mantém tudo se cancelar', async () => {
    const ui = userEvent.setup();
    actions.removePromoterAction.mockResolvedValue({ ok: true, data: null });
    renderWithProviders(<PromoterDetailPage promoter={promoter()} referrals={pageOf([])} canManage />);

    await ui.click(screen.getByRole('button', { name: 'Remover promotor' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('comissão de 12,5%');
    await ui.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(actions.removePromoterAction).not.toHaveBeenCalled();

    await ui.click(screen.getByRole('button', { name: 'Remover promotor' }));
    await ui.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover' }));
    expect(actions.removePromoterAction).toHaveBeenCalledExactlyOnceWith(ID_ANA);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/promotores'));
  });

  it('falha ao remover mantém o diálogo com a mensagem', async () => {
    const ui = userEvent.setup();
    actions.removePromoterAction.mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Sem permissão para esta ação.',
    });
    renderWithProviders(<PromoterDetailPage promoter={promoter()} referrals={pageOf([])} canManage />);
    await ui.click(screen.getByRole('button', { name: 'Remover promotor' }));
    await ui.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Sem permissão');
    expect(router.replace).not.toHaveBeenCalled();
  });
});

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
    await ui.type(screen.getByLabelText('Comissão (%)'), '10');
    await ui.click(screen.getByRole('button', { name: 'Tornar promotor' }));
    expect(actions.setPromoterAction).toHaveBeenCalledExactlyOnceWith(ID_ANA, 1000);
  });

  it('promotor: mostra a comissão com link para a página do promotor e permite remover', () => {
    renderUser(userDetail({ promoterCommissionBps: 1250 }), true, true);
    expect(screen.getByRole('link', { name: 'Promotor · comissão de 12,5%' })).toHaveAttribute(
      'href',
      `/promotores/${ID_ANA}`,
    );
    expect(screen.getByRole('button', { name: 'Salvar comissão' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover promotor' })).toBeInTheDocument();
  });

  it('mostra quem indicou o usuário (link só para quem pode ver promotores)', () => {
    const user = userDetail({ referredBy: { id: ID_BRUNO, displayId: 100003, name: 'Bruno Alves' } });
    const { unmount } = renderUser(user, true, false);
    expect(screen.getByRole('link', { name: 'Bruno Alves (ID 100003)' })).toHaveAttribute(
      'href',
      `/promotores/${ID_BRUNO}`,
    );
    expect(screen.queryByLabelText('Comissão (%)')).toBeNull();
    unmount();

    renderUser(user, false, false);
    expect(screen.getByText('Bruno Alves (ID 100003)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Bruno Alves/ })).toBeNull();
  });

  it('perfil sem acesso a promotores e usuário sem indicação: a seção nem aparece', () => {
    renderUser(userDetail(), false, false);
    expect(screen.queryByRole('heading', { name: 'Promotor' })).toBeNull();
  });
});

describe('menu do painel', () => {
  const renderSidebar = (permissions: Parameters<typeof AdminSidebar>[0]['permissions']) =>
    renderWithProviders(
      <AdminSidebar
        tenantName="Banca Teste"
        operatorName="Maria Souza"
        roleLabel="Gerente"
        permissions={permissions}
      />,
    );

  it('Promotores só aparece para quem pode consultar promotores', () => {
    const { unmount } = renderSidebar(['users.read', 'promoters.read']);
    const nav = screen.getAllByRole('navigation', { name: 'Menu do painel' })[0]!;
    expect(within(nav).getByRole('link', { name: 'Promotores' })).toHaveAttribute('href', '/promotores');
    expect(within(nav).getByRole('link', { name: 'Promotores' })).toHaveAttribute('aria-current', 'page');
    unmount();

    renderSidebar(['users.read']);
    expect(screen.queryByRole('link', { name: 'Promotores' })).toBeNull();
  });
});
