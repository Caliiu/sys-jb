import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicMural } from '@sysjb/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, user } from '@/test/render';

vi.mock('@/app/mural-actions', () => ({ markMuralSeenAction: vi.fn() }));

const actions = await import('@/app/mural-actions');
const { default: MuralSheet } = await import('./MuralSheet');
const markSeen = vi.mocked(actions.markMuralSeenAction);

const ONCE: PublicMural = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Coelho da Fortuna',
  displayMode: 'ONCE',
  version: 'a1',
};
const ALWAYS: PublicMural = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Raspadinha',
  displayMode: 'ALWAYS',
  version: 'b2',
};

beforeEach(() => {
  vi.clearAllMocks();
  markSeen.mockResolvedValue({ ok: true });
  window.sessionStorage.clear();
});

const renderSheet = (murals: PublicMural[]) => renderWithProviders(<MuralSheet murals={murals} userId={user.id} />);

describe('Mural no Dashboard', () => {
  it('mostra um mural depois do outro e registra o "Apenas uma vez" assim que aparece', async () => {
    renderSheet([ONCE, ALWAYS]);

    expect(await screen.findByRole('dialog', { name: 'Coelho da Fortuna' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Coelho da Fortuna' })).toHaveAttribute(
      'src',
      `/mural/${ONCE.id}/imagem?v=a1`,
    );
    expect(markSeen).toHaveBeenCalledWith(ONCE.id);
    // Entra deslizando de baixo, e o foco vai para a folha, não para o "Fechar" (sem contorno no botão).
    const sheet = screen.getByRole('dialog', { name: 'Coelho da Fortuna' });
    expect(sheet).toHaveClass('motion-safe:animate-sheet-up');
    expect(sheet).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(await screen.findByRole('dialog', { name: 'Raspadinha' })).toBeInTheDocument();
    // "Sempre" não é registrado no servidor.
    expect(markSeen).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    // Desce deslizando antes de sair.
    expect(screen.getByRole('dialog', { name: 'Raspadinha' }).style.transform).toBe('translateY(100%)');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"Sempre" não volta nesta aba depois de fechado (volta ao abrir o app de novo)', async () => {
    const { unmount } = renderSheet([ALWAYS]);
    await userEvent.click(await screen.findByRole('button', { name: 'Fechar' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    unmount();

    // Voltou ao Dashboard na mesma aba.
    const again = renderSheet([ALWAYS, ONCE]);
    expect(await screen.findByRole('dialog', { name: 'Coelho da Fortuna' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    again.unmount();

    // Nova aba (sessionStorage vazio): aparece de novo.
    window.sessionStorage.clear();
    renderSheet([ALWAYS]);
    expect(await screen.findByRole('dialog', { name: 'Raspadinha' })).toBeInTheDocument();
  });

  it('pula o mural cuja imagem não carrega', async () => {
    renderSheet([ALWAYS]);
    const image = await screen.findByRole('img', { name: 'Raspadinha' });
    image.dispatchEvent(new Event('error'));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
