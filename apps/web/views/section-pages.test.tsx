import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIZES_MENU, PULE_LOOKUP_MENU, REPORTS_MENU, RESULTS_MENU } from '@/lib/section-menus';
import { renderWithProviders, router, tenant, user } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/app/auth-actions', () => ({ meAction: vi.fn() }));

const { default: SectionMenuPage } = await import('./SectionMenuPage');

beforeEach(() => vi.clearAllMocks());

describe('SectionMenuPage', () => {
  it.each([
    [RESULTS_MENU, ['Resultado loterias']],
    [REPORTS_MENU, ['Consultar saldo', 'Consultar pule', 'Movimento loterias', 'Cotações', 'Cotadas']],
    [PRIZES_MENU, ['Consultar premiadas', 'Reclame']],
    [PULE_LOOKUP_MENU, ['Consultar por código', 'Consultar por data']],
  ])('%j mostra título e atalhos na ordem', (menu, labels) => {
    renderWithProviders(<SectionMenuPage tenant={tenant} user={user} menu={menu} />);
    expect(screen.getByRole('heading', { level: 1, name: menu.title })).toBeInTheDocument();
    const list = within(screen.getByRole('navigation', { name: menu.title })).getAllByRole('listitem');
    expect(list.map((item) => item.textContent)).toEqual(labels);
  });

  it('Consultar premiadas leva à escolha da data e Reclame ao código da pule', () => {
    renderWithProviders(<SectionMenuPage tenant={tenant} user={user} menu={PRIZES_MENU} />);
    expect(screen.getByRole('link', { name: 'Consultar premiadas' })).toHaveAttribute('href', '/premiadas/consultar');
    expect(screen.getByRole('link', { name: 'Reclame' })).toHaveAttribute('href', '/premiadas/reclame');
  });

  it('volta configurável (a escolha da data volta para Premiadas)', () => {
    const menu = {
      title: 'Selecione a data',
      items: [{ label: '28/09/2026', href: '/premiadas/consultar/2026-09-28' }],
    };
    renderWithProviders(
      <SectionMenuPage
        tenant={tenant}
        user={user}
        menu={menu}
        back={{ href: '/premiadas', label: 'Voltar para premiadas' }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Voltar para premiadas' })).toHaveAttribute('href', '/premiadas');
    expect(screen.getByRole('link', { name: '28/09/2026' })).toHaveAttribute('href', '/premiadas/consultar/2026-09-28');
  });

  it('Resultados: Resultado loterias leva à escolha da data', () => {
    renderWithProviders(<SectionMenuPage tenant={tenant} user={user} menu={RESULTS_MENU} />);
    expect(screen.getByRole('link', { name: 'Resultado loterias' })).toHaveAttribute('href', '/resultados/loterias');
  });

  it('Relatórios: saldo, pule e movimento levam às próprias páginas', () => {
    renderWithProviders(<SectionMenuPage tenant={tenant} user={user} menu={REPORTS_MENU} />);
    expect(screen.getByRole('link', { name: 'Consultar saldo' })).toHaveAttribute('href', '/relatorios/saldo');
    expect(screen.getByRole('link', { name: 'Consultar pule' })).toHaveAttribute('href', '/relatorios/pule');
    expect(screen.getByRole('link', { name: 'Movimento loterias' })).toHaveAttribute('href', '/relatorios/movimento');
    expect(screen.getByRole('link', { name: 'Cotações' })).toHaveAttribute('href', '/relatorios/cotacoes');
  });

  it('atalho sem página avisa "em breve"', async () => {
    renderWithProviders(<SectionMenuPage tenant={tenant} user={user} menu={REPORTS_MENU} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cotadas' }));
    expect(screen.getByRole('status')).toHaveTextContent('Cotadas: disponível em breve.');
  });

  it('voltar leva ao início e o menu lateral abre', async () => {
    renderWithProviders(<SectionMenuPage tenant={tenant} user={user} menu={PRIZES_MENU} />);
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');

    await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(screen.getByRole('dialog', { name: 'Menu' }).closest('[inert]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Fechar menu' })).toHaveAttribute('aria-expanded', 'true');
  });
});
