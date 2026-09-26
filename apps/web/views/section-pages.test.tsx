import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIZES_MENU, REPORTS_MENU, RESULTS_MENU } from '@/lib/section-menus';
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
  ])('%j mostra título e atalhos na ordem', (menu, labels) => {
    renderWithProviders(<SectionMenuPage tenant={tenant} user={user} menu={menu} />);
    expect(screen.getByRole('heading', { level: 1, name: menu.title })).toBeInTheDocument();
    const list = within(screen.getByRole('navigation', { name: menu.title })).getAllByRole('listitem');
    expect(list.map((item) => item.textContent)).toEqual(labels);
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
