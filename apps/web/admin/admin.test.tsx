import { type Permission, ROLE_PERMISSIONS } from '@sysjb/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() };
let pathname = '/';
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => pathname }));

const actions = { adminLoginAction: vi.fn(), adminLogoutAction: vi.fn() };
vi.mock('@/app/admin/actions', () => ({
  adminLoginAction: (...args: unknown[]) => actions.adminLoginAction(...args),
  adminLogoutAction: (...args: unknown[]) => actions.adminLogoutAction(...args),
}));

const { AppHeader } = await import('./components/layout/app-header');
const { AuthenticatedLayout } = await import('./components/layout/authenticated-layout');
const { findNavLink, isNavActive, navGroupsFor } = await import('./components/layout/data/sidebar-data');
const { SessionProvider } = await import('./context/session-provider');
const { ThemeProvider } = await import('./context/theme-provider');
const { UserAuthForm } = await import('./features/auth/sign-in/components/user-auth-form');
const { NotFoundError } = await import('./features/errors/not-found-error');
const { UnauthorizedError } = await import('./features/errors/unauthorized-error');
const { THEME_SCRIPT } = await import('./lib/theme');

function renderPanel(permissions: readonly Permission[] = ROLE_PERMISSIONS.MANAGER, defaultOpen = true) {
  return render(
    <ThemeProvider initialTheme="light">
      <SessionProvider
        user={{
          name: 'Maria Souza',
          email: 'maria@banca.test',
          role: 'Gerente',
          permissions,
          tenant: { name: 'Banca Teste', logoUrl: null },
        }}
      >
        <AuthenticatedLayout defaultOpen={defaultOpen}>
          <AppHeader />
        </AuthenticatedLayout>
      </SessionProvider>
    </ThemeProvider>,
  );
}

const nav = () => screen.getByRole('navigation', { name: 'Menu do painel' });
const groupTitles = (permissions: readonly Permission[]) => navGroupsFor(permissions).map((group) => group.title);

beforeEach(() => {
  vi.clearAllMocks();
  pathname = '/';
  for (const name of ['admin_theme', 'sidebar_state', 'layout_collapsible', 'layout_variant']) {
    document.cookie = `${name}=; max-age=0; path=/`;
  }
  document.documentElement.classList.remove('dark');
});

describe('menu do painel (dados)', () => {
  it('Geral (Início), Pules (Pules Registradas) e Prêmios (Pules Premiadas), com tickets.read; sem permissão, nada', () => {
    expect(groupTitles(ROLE_PERMISSIONS.MANAGER)).toEqual(['Geral', 'Pules', 'Prêmios']);
    expect(groupTitles(ROLE_PERMISSIONS.SUPPORT)).toEqual(['Geral', 'Pules', 'Prêmios']);
    expect(groupTitles(['users.read'])).toEqual(['Geral']);
    expect(navGroupsFor([])).toEqual([]);
    expect(findNavLink('/')?.title).toBe('Início');
    expect(findNavLink('/premios')?.title).toBe('Pules Premiadas');
    expect(findNavLink('/bilhetes')?.title).toBe('Pules Registradas');
    expect(findNavLink('/usuarios')).toBeUndefined();
  });

  it('página ativa inclui subpáginas; Início só na raiz', () => {
    expect(isNavActive('/usuarios/abc', '/usuarios')).toBe(true);
    expect(isNavActive('/usuarios-x', '/usuarios')).toBe(false);
    expect(isNavActive('/usuarios', '/')).toBe(false);
    expect(isNavActive('/', '/')).toBe(true);
  });
});

describe('layout do painel', () => {
  it('menu lateral: banca no topo, Início marcado e operador no rodapé', () => {
    renderPanel();
    const title = screen.getByRole('link', { name: /Banca Teste/ });
    expect(title).toHaveAttribute('href', '/');
    expect(title).toHaveTextContent('Painel administrativo');
    expect(
      within(nav())
        .getAllByRole('group')
        .map((g) => g.getAttribute('aria-label')),
    ).toEqual(['Geral', 'Pules', 'Prêmios']);
    expect(within(nav()).getByRole('link', { name: 'Pules Registradas' })).toHaveAttribute('href', '/bilhetes');
    expect(within(nav()).getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav()).getByRole('link', { name: 'Pules Premiadas' })).toHaveAttribute('href', '/premios');
    expect(screen.getAllByText('Maria Souza').length).toBeGreaterThan(0);
  });

  it('o botão do cabeçalho recolhe o menu e guarda a escolha; o servidor pode começar recolhido', async () => {
    const { container, unmount } = renderPanel();
    const sidebar = () => container.querySelector('[data-slot="sidebar"]')!;
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');
    await userEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Mostrar ou recolher o menu' }),
    );
    expect(sidebar()).toHaveAttribute('data-state', 'collapsed');
    expect(document.cookie).toContain('sidebar_state=false');
    unmount();

    const collapsed = renderPanel(ROLE_PERMISSIONS.MANAGER, false);
    expect(collapsed.container.querySelector('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'collapsed');
  });

  it('busca (botão ou Ctrl+K): acha a página sem acento e navega', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));
    const dialog = screen.getByRole('dialog', { name: 'Busca' });
    await userEvent.type(within(dialog).getByRole('combobox'), 'inicio');
    const options = within(dialog).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Início']);
    await userEvent.click(options[0]!);
    expect(router.push).toHaveBeenCalledWith('/');

    await userEvent.keyboard('{Control>}k{/Control}');
    const again = screen.getByRole('dialog', { name: 'Busca' });
    await userEvent.type(within(again).getByRole('combobox'), 'xyz');
    expect(within(again).getByText('Nada encontrado.')).toBeInTheDocument();
  });

  it('tema: Escuro põe .dark no <html> e guarda no cookie; Claro tira', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Tema' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Escuro/ }));
    expect(document.documentElement).toHaveClass('dark');
    expect(document.cookie).toContain('admin_theme=dark');

    await userEvent.click(screen.getByRole('button', { name: 'Tema' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Claro/ }));
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('Sair (menu da conta) pede confirmação, encerra a sessão e volta ao login', async () => {
    actions.adminLogoutAction.mockResolvedValue(undefined);
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Conta' }));
    expect(screen.getByRole('menu')).toHaveTextContent('maria@banca.test');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sair' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Sair' });
    expect(actions.adminLogoutAction).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Sair' }));
    expect(actions.adminLogoutAction).toHaveBeenCalledOnce();
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('se a saída falhar, continua na tela', async () => {
    actions.adminLogoutAction.mockRejectedValue(new Error('rede'));
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Conta' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sair' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sair' }));
    expect(router.replace).not.toHaveBeenCalled();
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sair' })).toBeEnabled();
  });
});

describe('login do painel', () => {
  const fill = async (email: string, password: string) => {
    if (email) await userEvent.type(screen.getByLabelText('E-mail'), email);
    if (password) await userEvent.type(screen.getByLabelText('Senha'), password);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  };

  it('campos vazios: avisa e não chama o servidor', async () => {
    render(<UserAuthForm />);
    await fill('', '');
    expect(await screen.findByText('Informe o e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
    expect(actions.adminLoginAction).not.toHaveBeenCalled();
  });

  it('credenciais certas: entra e vai ao Início', async () => {
    actions.adminLoginAction.mockResolvedValue({ ok: true, data: null });
    render(<UserAuthForm />);
    await fill('op@banca.test', 'segredo qualquer');
    expect(actions.adminLoginAction).toHaveBeenCalledWith({ email: 'op@banca.test', password: 'segredo qualquer' });
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('recusado: mostra a mensagem do servidor e fica na tela', async () => {
    actions.adminLoginAction.mockResolvedValue({
      ok: false,
      code: 'INVALID_CREDENTIALS',
      message: 'E-mail ou senha incorretos.',
    });
    render(<UserAuthForm />);
    await fill('op@banca.test', 'errada');
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('falha inesperada não quebra a tela', async () => {
    actions.adminLoginAction.mockRejectedValue(new Error('rede'));
    render(<UserAuthForm />);
    await fill('op@banca.test', 'segredo');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar. Tente novamente.');
  });
});

describe('telas de erro e tema inicial', () => {
  it('404 leva ao Início; 401 leva ao login', () => {
    const { unmount } = render(<NotFoundError />);
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o início' })).toHaveAttribute('href', '/');
    unmount();
    render(<UnauthorizedError />);
    expect(screen.getByRole('link', { name: 'Entrar no painel' })).toHaveAttribute('href', '/login');
  });

  it('o script inline aplica o escuro do cookie antes da hidratação (e não aplica sem cookie)', () => {
    new Function(THEME_SCRIPT)();
    expect(document.documentElement).not.toHaveClass('dark');
    document.cookie = 'admin_theme=dark; path=/';
    new Function(THEME_SCRIPT)();
    expect(document.documentElement).toHaveClass('dark');
  });
});
