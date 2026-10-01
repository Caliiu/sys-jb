import {
  type AdminUserDetail,
  type AdminUserListItem,
  type Page,
  type Permission,
  ROLE_PERMISSIONS,
} from '@sysjb/contracts';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router, tenant } from '@/test/render';

const actions = {
  adminLoginAction: vi.fn(),
  adminLogoutAction: vi.fn(),
  updateUserAction: vi.fn(),
  setUserStatusAction: vi.fn(),
};

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/usuarios' }));
vi.mock('@/app/admin/actions', () => ({
  adminLoginAction: (...args: unknown[]) => actions.adminLoginAction(...args),
  adminLogoutAction: (...args: unknown[]) => actions.adminLogoutAction(...args),
  updateUserAction: (...args: unknown[]) => actions.updateUserAction(...args),
  setUserStatusAction: (...args: unknown[]) => actions.setUserStatusAction(...args),
}));

const { default: UsersPage } = await import('./UsersPage');
const { default: UserDetailPage } = await import('./UserDetailPage');
const { default: AdminLoginPage } = await import('./AdminLoginPage');
const { default: AdminShell } = await import('@/components/admin/AdminShell');

const ID_ANA = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';
const item = (over: Partial<AdminUserListItem> = {}): AdminUserListItem => ({
  id: ID_ANA,
  displayId: 100002,
  name: 'Ana Souza Lima',
  document: '52998224725',
  phone: '11912345678',
  status: 'ACTIVE',
  referredBy: null,
  promoter: null,
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
  inviteCode: 'CDYGE',
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
  promoterCommissionBps: null,
  referredBy: null,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

const Q = { page: 1, pageSize: 25, search: '', status: '' as const, promoterId: '' };
const ID_PAULA = 'c'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b';

describe('lista de apostadores', () => {
  it('mostra os apostadores com ID, telefone com WhatsApp, login (CPF), status e Editar', () => {
    renderWithProviders(
      <UsersPage
        query={Q}
        result={page([
          item(),
          item({ id: 'b'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b', name: 'Bruno Alves', status: 'BLOCKED' }),
        ])}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Apostadores' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Filtros' })).toBeInTheDocument();
    expect(screen.getByText(/Total:/)).toHaveTextContent('Total: 2');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const first = within(rows[0]!);
    expect(first.getByRole('link', { name: 'Ana Souza Lima' })).toHaveAttribute('href', `/usuarios/${ID_ANA}`);
    expect(first.getByRole('link', { name: 'Editar Ana Souza Lima' })).toHaveAttribute('href', `/usuarios/${ID_ANA}`);
    expect(first.getByText('100002')).toBeInTheDocument();
    expect(first.getByText('25/09/26')).toBeInTheDocument();
    expect(first.getByRole('link', { name: 'WhatsApp (11) 91234-5678' })).toHaveAttribute(
      'href',
      'https://wa.me/5511912345678',
    );
    expect(first.getByText('529.982.247-25')).toBeInTheDocument();
    expect(first.getByText('Ativo')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Bloqueado')).toBeInTheDocument();
  });

  it('Promotor (com a %) e Indicado por são colunas separadas; só o Indicado por é link', () => {
    const promoter = { id: ID_PAULA, displayId: 100001, name: 'Paula Promotora', commissionBps: 700 };
    const referredBy = { id: ID_PAULA, displayId: 100001, name: 'Paula Promotora' };
    const plain = { id: 'e'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b', displayId: 100009, name: 'Jogador Comum' };
    const items = [
      item({ promoter, referredBy }),
      item({ id: 'd'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b', referredBy: plain }),
    ];

    renderWithProviders(<UsersPage query={Q} result={page(items)} />);
    expect(screen.getByRole('columnheader', { name: 'Promotor' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Indicado por' })).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    const links = within(rows[0]!).getAllByRole('link', { name: 'Paula Promotora' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', `/usuarios/${ID_PAULA}`);
    expect(within(rows[0]!).getByText('7%')).toBeInTheDocument();
    expect(within(rows[1]!).getByLabelText('Sem promotor')).toHaveTextContent('—');
    expect(within(rows[1]!).getByRole('link', { name: 'Jogador Comum' })).toBeInTheDocument();
  });

  it('sem resultados mostra o aviso', () => {
    renderWithProviders(<UsersPage query={{ ...Q, search: 'zzz' }} result={page([])} />);
    expect(screen.getByText('Nenhum resultado encontrado')).toBeInTheDocument();
    expect(screen.getByText('Nenhum registro')).toBeInTheDocument();
  });

  it('filtros são um formulário GET (Pesquisar aplica) que mantém os valores da URL', () => {
    const promoters = [{ id: ID_PAULA, displayId: 100001, name: 'Paula Promotora' }];
    renderWithProviders(
      <UsersPage
        query={{ ...Q, search: 'ana', status: 'BLOCKED', pageSize: 50, promoterId: ID_PAULA }}
        result={page([item()])}
        promoters={promoters}
      />,
    );
    const form = screen.getByRole('search', { name: 'Filtrar apostadores' });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/usuarios');
    expect(screen.getByRole('searchbox', { name: 'Pesquisar' })).toHaveValue('ana');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('BLOCKED');
    expect(screen.getByRole('combobox', { name: 'Resultados por página' })).toHaveValue('50');
    expect(screen.getByRole('combobox', { name: 'Promotor' })).toHaveValue(ID_PAULA);
    expect(screen.getByRole('option', { name: '100001 - Paula Promotora' })).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Pesquisar' })).toHaveAttribute('type', 'submit');
    expect(within(form).getByRole('link', { name: 'Limpar Filtros' })).toHaveAttribute('href', '/usuarios');
    expect(screen.getByRole('link', { name: 'Exportar' })).toHaveAttribute(
      'href',
      `/usuarios/exportar?search=ana&status=BLOCKED&promoterId=${ID_PAULA}`,
    );
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeInTheDocument();
  });

  it('sem opções de promotor o filtro não aparece', () => {
    renderWithProviders(<UsersPage query={Q} result={page([item()])} />);
    expect(screen.queryByRole('combobox', { name: 'Promotor' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Exportar' })).toHaveAttribute('href', '/usuarios/exportar');
  });

  it('paginação preserva os filtros; nas pontas Anterior/Próximo ficam desabilitados', () => {
    const query = { ...Q, page: 2, search: 'ana', status: 'ACTIVE' as const, pageSize: 10 };
    const { unmount } = renderWithProviders(
      <UsersPage query={query} result={page([item()], { page: 2, pageSize: 10, totalPages: 5, total: 41 })} />,
    );
    expect(screen.getByText('Mostrando 11 a 20 de 41 registros')).toBeInTheDocument();
    expect(screen.getByText('Página 2 de 5')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute(
      'href',
      '/usuarios?search=ana&status=ACTIVE&pageSize=10',
    );
    expect(screen.getByRole('link', { name: 'Próximo' })).toHaveAttribute(
      'href',
      '/usuarios?search=ana&status=ACTIVE&pageSize=10&page=3',
    );
    unmount();

    renderWithProviders(<UsersPage query={Q} result={page([item()], { pageSize: 25 })} />);
    expect(screen.queryByRole('link', { name: 'Anterior' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Próximo' })).toBeNull();
    expect(screen.getByText('Mostrando 1 a 1 de 1 registro')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 1')).toBeInTheDocument();
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
    expect(router.replace).toHaveBeenCalledWith('/login');
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

  it('é neutra (a banca vem do login, não da tela) e valida os campos antes de chamar a API', async () => {
    const ui = userEvent.setup();
    renderWithProviders(<AdminLoginPage />);
    expect(screen.getByRole('heading', { name: 'PAINEL ADMINISTRATIVO' })).toBeInTheDocument();
    expect(screen.queryByText(tenant.name)).toBeNull();

    await fill(ui, '', '');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o e-mail.');
    await fill(ui, 'op@example.test', '');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe a senha.');
    expect(actions.adminLoginAction).not.toHaveBeenCalled();
  });

  it('entra e vai para a lista de usuários', async () => {
    actions.adminLoginAction.mockResolvedValue({ ok: true, data: null });
    const ui = userEvent.setup();
    renderWithProviders(<AdminLoginPage />);
    await fill(ui, 'op@example.test', 'segredo qualquer');
    expect(actions.adminLoginAction).toHaveBeenCalledExactlyOnceWith({
      email: 'op@example.test',
      password: 'segredo qualquer',
    });
    expect(router.replace).toHaveBeenCalledWith('/usuarios');
  });

  it('mostra a mensagem de erro e permite tentar de novo', async () => {
    actions.adminLoginAction.mockResolvedValue({
      ok: false,
      code: 'INVALID_CREDENTIALS',
      message: 'E-mail ou senha inválidos.',
    });
    const ui = userEvent.setup();
    renderWithProviders(<AdminLoginPage />);
    await fill(ui, 'op@example.test', 'errada');
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('falha inesperada não quebra a tela', async () => {
    actions.adminLoginAction.mockRejectedValue(new Error('rede'));
    const ui = userEvent.setup();
    renderWithProviders(<AdminLoginPage />);
    await fill(ui, 'op@example.test', 'segredo qualquer');
    // Espera maior: com a suíte inteira rodando, a renderização do erro pode passar de 1 s.
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'Não foi possível entrar. Tente novamente.',
    );
  });
});

describe('menu do painel', () => {
  const renderSidebar = (permissions: readonly Permission[]) =>
    renderWithProviders(
      <AdminShell tenantName="Banca Teste" operatorName="Maria Souza" roleLabel="Gerente" permissions={permissions} />,
    );

  it('estrutura da imagem: Início, Operação, Relatórios (painel), Carteira, CRM, Configurações e Administração no rodapé', () => {
    renderSidebar(ROLE_PERMISSIONS.MANAGER);
    const nav = screen.getAllByRole('navigation', { name: 'Menu do painel' })[0]!;
    expect(within(nav).getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/');
    const groups = within(nav)
      .getAllByRole('group')
      .map((g) => within(g).getAllByRole('button')[0]!.textContent);
    expect(groups).toEqual(['Operação', 'Carteira', 'CRM', 'Configurações', 'Administração']);
    // Relatórios não abre dentro do menu: o botão abre o painel ao lado.
    expect(within(nav).getByRole('button', { name: 'Relatórios' })).toHaveAttribute('aria-expanded', 'false');
    // Traços: depois de Início, antes de Carteira e, dentro de Configurações, antes de Mural (fechado aqui).
    expect(within(nav).getAllByRole('separator')).toHaveLength(2);
    // O grupo da página atual já vem aberto, com os itens na ordem da imagem.
    const operation = within(nav).getByRole('group', { name: 'Operação' });
    expect(
      within(operation)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Apostadores', 'Pules', 'Pules Premiadas', 'Resumo da Operação']);
  });

  it('mostra o operador com o perfil e marca a página atual (Apostadores)', () => {
    renderSidebar(['users.read']);
    const nav = screen.getAllByRole('navigation', { name: 'Menu do painel' })[0]!;
    const group = within(nav).getByRole('group', { name: 'Operação' });
    expect(within(group).getByRole('button', { name: 'Operação' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(group).getByRole('link', { name: 'Apostadores' })).toHaveAttribute('href', '/usuarios');
    expect(within(group).getByRole('link', { name: 'Apostadores' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByText('Maria Souza').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gerente').length).toBeGreaterThan(0);
  });

  it('selo da conta: a logo da banca; sem logo ou se a imagem falhar, a inicial do operador', () => {
    const badge = () => screen.getAllByRole('button', { name: /Maria Souza/ })[0]!.firstElementChild!;
    const { unmount } = renderSidebar(['users.read']);
    expect(badge().querySelector('img')).toBeNull();
    expect(badge()).toHaveTextContent('M');
    unmount();

    renderWithProviders(
      <AdminShell
        tenantName="Banca Teste"
        tenantLogoUrl="/marca/logo?v=abc"
        operatorName="Maria Souza"
        roleLabel="Gerente"
        permissions={['users.read']}
      />,
    );
    const img = badge().querySelector('img')!;
    expect(img).toHaveAttribute('src', '/marca/logo?v=abc');
    expect(img).toHaveAttribute('alt', '');
    fireEvent.error(img);
    expect(badge().querySelector('img')).toBeNull();
    expect(badge()).toHaveTextContent('M');
  });

  it('sem permissão de consulta, nada aparece', () => {
    renderSidebar([]);
    expect(screen.queryByRole('link', { name: 'Início' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Operação' })).toBeNull();
  });

  it('Log de auditoria (Administração) e Personalização (com Valores) só aparecem com a permissão', async () => {
    const nav = () => screen.getAllByRole('navigation', { name: 'Menu do painel' })[0]!;
    const { unmount } = renderSidebar(ROLE_PERMISSIONS.SUPPORT);
    expect(within(nav()).queryByRole('group', { name: 'Administração' })).toBeNull();
    // Suporte não tem nenhum item de Configurações: o grupo nem aparece.
    expect(within(nav()).queryByRole('button', { name: 'Configurações' })).toBeNull();
    expect(within(nav()).queryByRole('link', { name: 'Personalização' })).toBeNull();
    unmount();

    // Financeiro: sem a identidade visual, mas vê Personalização por causa da aba Valores.
    const finance = renderSidebar(ROLE_PERMISSIONS.FINANCE);
    await userEvent.click(within(nav()).getByRole('button', { name: 'Configurações' }));
    expect(within(nav()).getByRole('link', { name: 'Personalização' })).toHaveAttribute('href', '/personalizacao');
    finance.unmount();

    renderSidebar(ROLE_PERMISSIONS.MANAGER);
    const admin = within(nav()).getByRole('group', { name: 'Administração' });
    await userEvent.click(within(admin).getByRole('button', { name: 'Administração' }));
    expect(within(admin).getByRole('link', { name: 'Log de auditoria' })).toHaveAttribute('href', '/auditoria');
    // Comissões saiu da Carteira (virou Personalização > Valores).
    const wallet = within(nav()).getByRole('group', { name: 'Carteira' });
    await userEvent.click(within(wallet).getByRole('button', { name: 'Carteira' }));
    expect(within(wallet).queryByRole('link', { name: 'Comissões' })).toBeNull();
  });

  it('Relatórios abre o painel ao lado com os subgrupos; fecha com Esc, clique fora ou no próprio botão', async () => {
    renderSidebar(ROLE_PERMISSIONS.FINANCE);
    const nav = screen.getAllByRole('navigation', { name: 'Menu do painel' })[0]!;
    const toggle = within(nav).getByRole('button', { name: 'Relatórios' });
    expect(screen.queryByRole('region', { name: 'Relatórios' })).toBeNull();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('region', { name: 'Relatórios' });
    expect(toggle).toHaveAttribute('aria-controls', panel.id);
    expect(
      within(panel)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['Relatório geral', '/relatorios/geral'],
      ['Geral cassino', '/relatorios/cassino/geral'],
      ['Fechamento cassino', '/relatorios/cassino/fechamento'],
      ['Vendas por extração', '/relatorios/loterias/vendas-por-extracao'],
    ]);
    // Subgrupo abre e fecha.
    const casino = within(panel).getByRole('group', { name: 'Cassino' });
    await userEvent.click(within(casino).getByRole('button', { name: 'Cassino' }));
    expect(within(casino).queryByRole('link', { name: 'Geral cassino' })).toBeNull();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Relatórios' })).toBeNull();
    await userEvent.click(toggle);
    expect(screen.getByRole('region', { name: 'Relatórios' })).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.queryByRole('region', { name: 'Relatórios' })).toBeNull();
    await userEvent.click(toggle);
    await userEvent.click(screen.getByText('Banca Teste'));
    expect(screen.queryByRole('region', { name: 'Relatórios' })).toBeNull();
  });

  it('Suporte não vê Relatórios; na gaveta do celular, Relatórios abre dentro do menu', async () => {
    const { unmount } = renderSidebar(ROLE_PERMISSIONS.SUPPORT);
    expect(screen.queryByRole('button', { name: 'Relatórios' })).toBeNull();
    unmount();

    renderSidebar(ROLE_PERMISSIONS.MANAGER);
    const drawer = screen.getAllByRole('navigation', { name: 'Menu do painel', hidden: true })[1]!;
    const reports = within(drawer).getByRole('group', { name: 'Relatórios', hidden: true });
    expect(within(reports).getByRole('group', { name: 'Loterias', hidden: true })).toBeInTheDocument();
  });

  it('grupos abrem e fecham; fora da página atual começam fechados', async () => {
    renderSidebar(ROLE_PERMISSIONS.MANAGER);
    const nav = screen.getAllByRole('navigation', { name: 'Menu do painel' })[0]!;
    const toggle = within(nav).getByRole('button', { name: 'Carteira' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(nav).queryByRole('link', { name: 'Depósitos' })).toBeNull();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav).getByRole('link', { name: 'Depósitos' })).toHaveAttribute('href', '/depositos');

    const current = within(nav).getByRole('button', { name: 'Operação' });
    await userEvent.click(current);
    expect(current).toHaveAttribute('aria-expanded', 'false');
  });

  it('relógio do topo parte do horário do servidor (Brasília)', () => {
    renderWithProviders(
      <AdminShell
        tenantName="Banca Teste"
        operatorName="Maria Souza"
        roleLabel="Gerente"
        permissions={['users.read']}
        serverNow="2026-09-29T19:02:43.000Z"
      />,
    );
    expect(screen.getByText('16:02')).toBeInTheDocument();
    // A banca fica à direita da barra.
    expect(screen.getAllByText('Banca Teste').length).toBeGreaterThan(0);
  });

  it('barra superior: trilha grupo › página atual', () => {
    renderSidebar(['users.read']);
    const trail = screen.getByRole('navigation', { name: 'Trilha' });
    expect(within(trail).getByText('Operação')).not.toHaveAttribute('aria-current');
    expect(within(trail).getByText('Apostadores')).toHaveAttribute('aria-current', 'page');
  });

  it('a busca do menu filtra os itens (sem acento) e abre os grupos', async () => {
    renderSidebar(ROLE_PERMISSIONS.MANAGER);
    const nav = screen.getAllByRole('navigation', { name: 'Menu do painel' })[0]!;
    const search = screen.getAllByRole('searchbox', { name: 'Pesquisar no menu' })[0]!;
    await userEvent.type(search, 'cotacoes');
    expect(within(nav).getByRole('link', { name: 'Cotações' })).toHaveAttribute('href', '/cotacoes');
    expect(within(nav).queryByRole('link', { name: 'Sorteios' })).toBeNull();
    expect(within(nav).queryByRole('button', { name: 'Operação' })).toBeNull();
    expect(within(nav).queryAllByRole('separator')).toHaveLength(0);
    await userEvent.clear(search);
    await userEvent.type(search, 'xyz');
    expect(within(nav).getByText('Nada encontrado.')).toBeInTheDocument();
  });

  const openAccount = async () => {
    await userEvent.click(screen.getAllByRole('button', { name: /Maria Souza/ })[0]!);
    return screen.getByRole('menu', { name: 'Conta' });
  };

  it('Sair fica no menu da conta; encerra a sessão e volta ao login', async () => {
    actions.adminLogoutAction.mockResolvedValue(undefined);
    renderSidebar(['users.read']);
    expect(screen.queryByRole('menuitem', { name: 'Sair' })).toBeNull();
    const menu = await openAccount();
    expect(menu).toHaveTextContent('Banca Teste');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sair' }));
    expect(actions.adminLogoutAction).toHaveBeenCalledOnce();
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('menu da conta fecha com Esc', async () => {
    renderSidebar(['users.read']);
    await openAccount();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'Conta' })).toBeNull();
  });

  it('se o logout falhar, avisa e continua na tela (a sessão pode seguir válida)', async () => {
    actions.adminLogoutAction.mockRejectedValue(new Error('rede'));
    renderSidebar(['users.read']);
    const menu = await openAccount();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sair' }));
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('Não foi possível sair. Tente novamente.');
    expect(router.replace).not.toHaveBeenCalled();
    expect(within(menu).getByRole('menuitem', { name: 'Sair' })).toBeEnabled();
  });

  it('no desktop o botão da barra recolhe e mostra o menu', async () => {
    renderSidebar(['users.read']);
    const toggle = screen.getByRole('button', { name: 'Recolher menu' });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveAccessibleName('Mostrar menu');
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
