import type { AdminUserDetail, AdminUserListItem, Page } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router, tenant } from '@/test/render';

const actions = {
  adminLoginAction: vi.fn(),
  adminLogoutAction: vi.fn(),
  updateUserAction: vi.fn(),
  setUserStatusAction: vi.fn(),
};

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/admin/usuarios' }));
vi.mock('@/app/admin/actions', () => ({
  adminLoginAction: (...args: unknown[]) => actions.adminLoginAction(...args),
  adminLogoutAction: (...args: unknown[]) => actions.adminLogoutAction(...args),
  updateUserAction: (...args: unknown[]) => actions.updateUserAction(...args),
  setUserStatusAction: (...args: unknown[]) => actions.setUserStatusAction(...args),
}));

const { default: UsersPage } = await import('./UsersPage');
const { default: UserDetailPage } = await import('./UserDetailPage');
const { default: AdminLoginPage } = await import('./AdminLoginPage');
const { default: AdminSidebar } = await import('@/components/admin/AdminSidebar');

const ID_ANA = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';
const item = (over: Partial<AdminUserListItem> = {}): AdminUserListItem => ({
  id: ID_ANA,
  displayId: 100002,
  name: 'Ana Souza Lima',
  documentMasked: '***.982.247-**',
  phoneMasked: '(11) *****-5678',
  status: 'ACTIVE',
  createdAt: '2026-09-25T17:30:00.000Z',
  ...over,
});
const page = (items: AdminUserListItem[], over: Partial<Page<AdminUserListItem>> = {}): Page<AdminUserListItem> => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  totalPages: 1,
  ...over,
});
const detail = (over: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
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
    balanceJb: 123456,
    bonusJb: 500,
    prizesJb: 44,
    balanceGames: 1000,
    bonusGames: 0,
    prizesGames: 0,
    withdrawable: 0,
    totalAvailableJb: 124000,
    totalAvailableGames: 1000,
  },
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('lista de usuários', () => {
  it('mostra os usuários com dados mascarados, status e link para o detalhe', () => {
    renderWithProviders(
      <UsersPage
        query={{ page: 1, search: '', status: '' }}
        result={page([
          item(),
          item({ id: 'b'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b', name: 'Bruno Alves', status: 'BLOCKED' }),
        ])}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole('link', { name: 'Ana Souza Lima' })).toHaveAttribute(
      'href',
      `/admin/usuarios/${ID_ANA}`,
    );
    expect(within(rows[0]!).getByText('***.982.247-**')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('(11) *****-5678')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('25/09/2026')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Ativo')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Bloqueado')).toBeInTheDocument();
  });

  it('sem resultados mostra o aviso', () => {
    renderWithProviders(<UsersPage query={{ page: 1, search: 'zzz', status: '' }} result={page([])} />);
    expect(screen.getByText('Nenhum usuário encontrado.')).toBeInTheDocument();
  });

  it('busca e filtro são um formulário GET que mantém os valores da URL', () => {
    renderWithProviders(<UsersPage query={{ page: 1, search: 'ana', status: 'BLOCKED' }} result={page([item()])} />);
    const form = screen.getByRole('search');
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/admin/usuarios');
    expect(screen.getByRole('searchbox', { name: 'Buscar usuários' })).toHaveValue('ana');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('BLOCKED');
    expect(screen.getByRole('link', { name: 'Limpar' })).toHaveAttribute('href', '/admin/usuarios');
  });

  it('sem filtro ativo não mostra "Limpar"', () => {
    renderWithProviders(<UsersPage query={{ page: 1, search: '', status: '' }} result={page([item()])} />);
    expect(screen.queryByRole('link', { name: 'Limpar' })).toBeNull();
  });

  it('paginação preserva busca e status; nas pontas o botão fica desabilitado', () => {
    const query = { page: 2, search: 'ana', status: 'ACTIVE' as const };
    const { unmount } = renderWithProviders(
      <UsersPage query={query} result={page([item()], { page: 2, totalPages: 3, total: 41 })} />,
    );
    expect(screen.getByText('Página 2 de 3 · 41 usuários')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute(
      'href',
      '/admin/usuarios?search=ana&status=ACTIVE',
    );
    expect(screen.getByRole('link', { name: 'Próxima' })).toHaveAttribute(
      'href',
      '/admin/usuarios?search=ana&status=ACTIVE&page=3',
    );
    unmount();

    renderWithProviders(<UsersPage query={{ page: 1, search: '', status: '' }} result={page([item()])} />);
    expect(screen.queryByRole('link', { name: 'Anterior' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Próxima' })).toBeNull();
    expect(screen.getByText('Página 1 de 1 · 1 usuário')).toBeInTheDocument();
  });
});

describe('detalhe do usuário', () => {
  it('mostra cadastro, conta e carteira formatados', () => {
    renderWithProviders(<UserDetailPage user={detail()} canEdit canChangeStatus />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ana Souza Lima' })).toBeInTheDocument();
    expect(screen.getByText('529.982.247-25')).toBeInTheDocument();
    expect(screen.getByText('(11) 91234-5678')).toBeInTheDocument();
    expect(screen.getByText('17/05/1990')).toBeInTheDocument();
    expect(screen.getByText('25/09/2026 14:30')).toBeInTheDocument();
    expect(screen.getByText('Nunca')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.235,00')).toBeInTheDocument(); // 123456 + 44 centavos
    expect(screen.getByText('R$ 5,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 10,00')).toBeInTheDocument();
  });

  it('cada perfil vê só o que pode: Editar e Bloquear dependem da permissão', () => {
    const { unmount } = renderWithProviders(<UserDetailPage user={detail()} canEdit canChangeStatus />);
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bloquear usuário' })).toBeInTheDocument();
    unmount();

    const support = renderWithProviders(<UserDetailPage user={detail()} canEdit canChangeStatus={false} />);
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bloquear|Reativar/ })).toBeNull();
    support.unmount();

    renderWithProviders(<UserDetailPage user={detail()} canEdit={false} canChangeStatus={false} />);
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bloquear|Reativar/ })).toBeNull();
  });

  it('usuário bloqueado mostra o aviso e oferece reativar', () => {
    renderWithProviders(<UserDetailPage user={detail({ status: 'BLOCKED' })} canEdit canChangeStatus />);
    expect(screen.getByText('Usuário bloqueado: não consegue entrar na plataforma.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reativar usuário' })).toBeInTheDocument();
  });
});

describe('bloquear e reativar', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(screen.getByRole('button', { name }));
    return screen.getByRole('dialog');
  };

  it('cancelar não chama a API', async () => {
    const ui = userEvent.setup();
    renderWithProviders(<UserDetailPage user={detail()} canEdit canChangeStatus />);
    const dialog = await open(ui, 'Bloquear usuário');
    await ui.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(actions.setUserStatusAction).not.toHaveBeenCalled();
  });

  it('Esc também cancela', async () => {
    const ui = userEvent.setup();
    renderWithProviders(<UserDetailPage user={detail()} canEdit canChangeStatus />);
    await open(ui, 'Bloquear usuário');
    await ui.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirmar bloqueia e atualiza a página', async () => {
    actions.setUserStatusAction.mockResolvedValue({ ok: true, data: detail({ status: 'BLOCKED' }) });
    const ui = userEvent.setup();
    renderWithProviders(<UserDetailPage user={detail()} canEdit canChangeStatus />);
    const dialog = await open(ui, 'Bloquear usuário');
    await ui.click(within(dialog).getByRole('button', { name: 'Bloquear' }));
    expect(actions.setUserStatusAction).toHaveBeenCalledExactlyOnceWith(ID_ANA, 'BLOCKED');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('usuário bloqueado: confirmar reativa', async () => {
    actions.setUserStatusAction.mockResolvedValue({ ok: true, data: detail() });
    const ui = userEvent.setup();
    renderWithProviders(<UserDetailPage user={detail({ status: 'BLOCKED' })} canEdit canChangeStatus />);
    const dialog = await open(ui, 'Reativar usuário');
    await ui.click(within(dialog).getByRole('button', { name: 'Reativar' }));
    expect(actions.setUserStatusAction).toHaveBeenCalledExactlyOnceWith(ID_ANA, 'ACTIVE');
  });

  it('falha mantém o diálogo aberto com a mensagem e permite tentar de novo', async () => {
    actions.setUserStatusAction.mockResolvedValue({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Sem permissão para esta ação.',
    });
    const ui = userEvent.setup();
    renderWithProviders(<UserDetailPage user={detail()} canEdit canChangeStatus />);
    const dialog = await open(ui, 'Bloquear usuário');
    await ui.click(within(dialog).getByRole('button', { name: 'Bloquear' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Sem permissão para esta ação.');
    expect(router.refresh).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Bloquear' })).toBeEnabled();
  });

  it('sessão encerrada leva ao login', async () => {
    actions.setUserStatusAction.mockResolvedValue({ ok: false, code: 'SESSION_INVALID', message: 'x' });
    const ui = userEvent.setup();
    renderWithProviders(<UserDetailPage user={detail()} canEdit canChangeStatus />);
    const dialog = await open(ui, 'Bloquear usuário');
    await ui.click(within(dialog).getByRole('button', { name: 'Bloquear' }));
    expect(router.replace).toHaveBeenCalledWith('/admin/login');
  });

  it('erro inesperado não quebra a tela', async () => {
    actions.setUserStatusAction.mockRejectedValue(new Error('rede'));
    const ui = userEvent.setup();
    renderWithProviders(<UserDetailPage user={detail()} canEdit canChangeStatus />);
    const dialog = await open(ui, 'Bloquear usuário');
    await ui.click(within(dialog).getByRole('button', { name: 'Bloquear' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não foi possível concluir. Tente novamente.');
  });
});

describe('editar cadastro', () => {
  const startEditing = async (ui: ReturnType<typeof userEvent.setup>) => {
    renderWithProviders(<UserDetailPage user={detail()} canEdit canChangeStatus />);
    await ui.click(screen.getByRole('button', { name: 'Editar' }));
  };

  it('abre o formulário preenchido (com máscara) e envia só o que mudou', async () => {
    actions.updateUserAction.mockResolvedValue({ ok: true, data: detail({ name: 'Ana Lima' }) });
    const ui = userEvent.setup();
    await startEditing(ui);
    expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25');
    expect(screen.getByLabelText('Telefone')).toHaveValue('(11) 91234-5678');

    await ui.clear(screen.getByLabelText('Nome'));
    await ui.type(screen.getByLabelText('Nome'), 'Ana Lima');
    await ui.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(actions.updateUserAction).toHaveBeenCalledExactlyOnceWith(ID_ANA, { name: 'Ana Lima' });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('sem alterações, apenas fecha (nenhuma chamada à API)', async () => {
    const ui = userEvent.setup();
    await startEditing(ui);
    await ui.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(actions.updateUserAction).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Nome')).toBeNull();
  });

  it('dado inválido é apontado no campo, sem chamar a API, e some ao corrigir', async () => {
    const ui = userEvent.setup();
    await startEditing(ui);
    await ui.clear(screen.getByLabelText('CPF'));
    await ui.type(screen.getByLabelText('CPF'), '11111111111');
    await ui.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByText('CPF inválido.')).toBeInTheDocument();
    expect(screen.getByLabelText('CPF')).toBeInvalid();
    expect(actions.updateUserAction).not.toHaveBeenCalled();

    await ui.type(screen.getByLabelText('CPF'), '1');
    expect(screen.queryByText('CPF inválido.')).toBeNull();
  });

  it('conflito da API aparece no campo certo e a edição continua aberta', async () => {
    actions.updateUserAction.mockResolvedValue({
      ok: false,
      code: 'CONFLICT',
      message: 'Telefone já cadastrado nesta banca.',
      fieldErrors: { phone: 'Já cadastrado.', outroCampo: 'ignorado' },
    });
    const ui = userEvent.setup();
    await startEditing(ui);
    await ui.clear(screen.getByLabelText('Telefone'));
    await ui.type(screen.getByLabelText('Telefone'), '21999998888');
    await ui.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Já cadastrado.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Telefone já cadastrado nesta banca.');
    expect(screen.queryByText('ignorado')).toBeNull();
    expect(screen.getByLabelText('Telefone')).toBeInvalid();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('cancelar descarta as alterações', async () => {
    const ui = userEvent.setup();
    await startEditing(ui);
    await ui.type(screen.getByLabelText('Nome'), ' extra');
    await ui.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Ana Souza Lima', { selector: 'dd' })).toBeInTheDocument();

    await ui.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByLabelText('Nome')).toHaveValue('Ana Souza Lima');
  });

  it('perfil sem permissão não vê o botão Editar', () => {
    renderWithProviders(<UserDetailPage user={detail()} canEdit={false} canChangeStatus={false} />);
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.getByText('529.982.247-25')).toBeInTheDocument();
  });
});

describe('login do painel', () => {
  const fill = async (ui: ReturnType<typeof userEvent.setup>, email: string, password: string) => {
    if (email) await ui.type(screen.getByLabelText('E-mail'), email);
    if (password) await ui.type(screen.getByLabelText('Senha'), password);
    await ui.click(screen.getByRole('button', { name: 'Entrar' }));
  };

  it('mostra a banca e valida os campos antes de chamar a API', async () => {
    const ui = userEvent.setup();
    renderWithProviders(<AdminLoginPage tenant={tenant} />);
    expect(screen.getByText(tenant.name)).toBeInTheDocument();

    await fill(ui, '', '');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o e-mail.');
    await fill(ui, 'op@example.test', '');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe a senha.');
    expect(actions.adminLoginAction).not.toHaveBeenCalled();
  });

  it('entra e vai para a lista de usuários', async () => {
    actions.adminLoginAction.mockResolvedValue({ ok: true, data: null });
    const ui = userEvent.setup();
    renderWithProviders(<AdminLoginPage tenant={tenant} />);
    await fill(ui, 'op@example.test', 'segredo qualquer');
    expect(actions.adminLoginAction).toHaveBeenCalledExactlyOnceWith({
      email: 'op@example.test',
      password: 'segredo qualquer',
    });
    expect(router.replace).toHaveBeenCalledWith('/admin/usuarios');
  });

  it('mostra a mensagem de erro e permite tentar de novo', async () => {
    actions.adminLoginAction.mockResolvedValue({
      ok: false,
      code: 'INVALID_CREDENTIALS',
      message: 'E-mail ou senha inválidos.',
    });
    const ui = userEvent.setup();
    renderWithProviders(<AdminLoginPage tenant={tenant} />);
    await fill(ui, 'op@example.test', 'errada');
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('falha inesperada não quebra a tela', async () => {
    actions.adminLoginAction.mockRejectedValue(new Error('rede'));
    const ui = userEvent.setup();
    renderWithProviders(<AdminLoginPage tenant={tenant} />);
    await fill(ui, 'op@example.test', 'segredo qualquer');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar. Tente novamente.');
  });
});

describe('menu do painel', () => {
  const renderSidebar = (permissions: readonly ('users.read' | 'users.update' | 'users.status')[]) =>
    renderWithProviders(
      <AdminSidebar
        tenantName="Banca Teste"
        operatorName="Maria Souza"
        roleLabel="Gerente"
        permissions={permissions}
      />,
    );

  it('mostra a banca, o operador com o perfil e os itens permitidos (marcando o atual)', () => {
    renderSidebar(['users.read']);
    const nav = screen.getAllByRole('navigation', { name: 'Menu do painel' })[0]!;
    expect(within(nav).getByRole('link', { name: 'Usuários' })).toHaveAttribute('href', '/admin/usuarios');
    expect(within(nav).getByRole('link', { name: 'Usuários' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByText('Maria Souza').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gerente').length).toBeGreaterThan(0);
  });

  it('sem permissão de consulta, o item não aparece', () => {
    renderSidebar([]);
    expect(screen.queryByRole('link', { name: 'Usuários' })).toBeNull();
  });

  it('Sair encerra a sessão e volta ao login', async () => {
    actions.adminLogoutAction.mockResolvedValue(undefined);
    renderSidebar(['users.read']);
    await userEvent.click(screen.getAllByRole('button', { name: 'Sair' })[0]!);
    expect(actions.adminLogoutAction).toHaveBeenCalledOnce();
    expect(router.replace).toHaveBeenCalledWith('/admin/login');
  });

  it('se o logout falhar, avisa e continua na tela (a sessão pode seguir válida)', async () => {
    actions.adminLogoutAction.mockRejectedValue(new Error('rede'));
    renderSidebar(['users.read']);
    await userEvent.click(screen.getAllByRole('button', { name: 'Sair' })[0]!);
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('Não foi possível sair. Tente novamente.');
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: 'Sair' })[0]).toBeEnabled();
  });

  it('no celular a gaveta abre e fecha (Esc)', async () => {
    renderSidebar(['users.read']);
    const drawer = screen.getByRole('dialog', { name: 'Menu do painel', hidden: true });
    expect(drawer.closest('[inert]')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(drawer.closest('[inert]')).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(drawer.closest('[inert]')).not.toBeNull();
  });
});
