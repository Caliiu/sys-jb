import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_HOME_LAYOUT, type HomeLayout } from '@sysjb/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/personalizacao/cards-inicio' }));
vi.mock('@/app/admin/actions', () => ({ saveHomeLayoutAction: vi.fn() }));

const actions = await import('@/app/admin/actions');
const { default: HomeLayoutEditor } = await import('./HomeLayoutEditor');
const save = vi.mocked(actions.saveHomeLayoutAction);

beforeEach(() => vi.clearAllMocks());

const renderEditor = (canManage = true, initial: HomeLayout = DEFAULT_HOME_LAYOUT) =>
  renderWithProviders(<HomeLayoutEditor initial={initial} canManage={canManage} primaryColor="#DF2120" />);

const blockNames = () =>
  within(screen.getByRole('list', { name: 'Blocos do início' }))
    .getAllByRole('listitem')
    .filter((item) => item.parentElement?.getAttribute('aria-label') === 'Blocos do início')
    .map((item) => item.querySelector('span.flex-1')!.textContent);
const preview = () => document.querySelector('figure')!;
const sent = () => save.mock.calls[0]![0] as HomeLayout;

describe('Cards do início no painel', () => {
  it('lista os blocos na ordem, com os cards dentro', () => {
    renderEditor();
    expect(blockNames()).toEqual([
      'Próximo sorteio',
      'Loterias e Fazendinha',
      'Atalhos',
      'Cassino',
      'Raspadinha e Bingo',
      'Atendimento',
    ]);
    const utility = screen.getByRole('list', { name: 'Cards de Atalhos' });
    expect(
      within(utility)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Horóscopo', 'Calcular', 'Sonhos', 'Atrasados']);
    // Sem mudanças, nada a salvar.
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restaurar ordem padrão' })).toBeDisabled();
  });

  it('reordena blocos e cards com as setas, esconde e salva; a pré-visualização acompanha', async () => {
    save.mockImplementation(async (layout) => ({ ok: true, data: layout as HomeLayout }));
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Subir Cassino' }));
    await userEvent.click(screen.getByRole('button', { name: 'Subir Fazendinha' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar Sonhos' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar Atendimento' }));
    // Primeiro/último não sobem/descem.
    expect(screen.getByRole('button', { name: 'Subir Próximo sorteio' })).toBeDisabled();

    expect(blockNames().slice(0, 4)).toEqual(['Próximo sorteio', 'Loterias e Fazendinha', 'Cassino', 'Atalhos']);
    expect(preview()).not.toHaveTextContent('ATENDIMENTO');
    expect(preview()).not.toHaveTextContent('Sonhos');
    expect(preview().textContent).toMatch(/FAZENDINHA.*LOTERIAS.*CASSINO/);

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const layout = sent();
    expect(layout.blocks.map((b) => b.id)).toEqual(['draw', 'primary', 'casino', 'utility', 'games', 'support']);
    expect(layout.blocks[1]!.cards.map((c) => c.id)).toEqual(['fazendinha', 'loterias']);
    expect(layout.blocks[3]!.cards.find((c) => c.id === 'sonhos')!.visible).toBe(false);
    expect(layout.blocks[5]!.visible).toBe(false);
    expect(await screen.findByText(/Cards do início salvos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('arrasta um bloco para outra posição, e um card não pode ir para outro bloco', () => {
    renderEditor();
    const rows = within(screen.getByRole('list', { name: 'Blocos do início' })).getAllByRole('listitem');
    const blocks = rows.filter((item) => item.parentElement?.getAttribute('aria-label') === 'Blocos do início');
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? '',
      effectAllowed: 'move',
    };
    // Atendimento (último) para o topo.
    fireEvent.dragStart(blocks[5]!, { dataTransfer });
    fireEvent.dragOver(blocks[0]!, { dataTransfer });
    fireEvent.drop(blocks[0]!, { dataTransfer });
    expect(blockNames()[0]).toBe('Atendimento');

    // Bingo solto na lista de Loterias/Fazendinha: ignorado.
    const bingo = within(screen.getByRole('list', { name: 'Cards de Raspadinha e Bingo' })).getAllByRole(
      'listitem',
    )[1]!;
    const loterias = within(screen.getByRole('list', { name: 'Cards de Loterias e Fazendinha' })).getAllByRole(
      'listitem',
    )[0]!;
    fireEvent.dragStart(bingo, { dataTransfer });
    fireEvent.drop(loterias, { dataTransfer });
    expect(
      within(screen.getByRole('list', { name: 'Cards de Loterias e Fazendinha' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Loterias', 'Fazendinha']);
  });

  it('desfaz e restaura a ordem padrão', async () => {
    const custom: HomeLayout = { blocks: [...DEFAULT_HOME_LAYOUT.blocks].reverse() };
    renderEditor(true, custom);
    expect(blockNames()[0]).toBe('Atendimento');
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar ordem padrão' }));
    expect(blockNames()[0]).toBe('Próximo sorteio');
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer alterações' }));
    expect(blockNames()[0]).toBe('Atendimento');
  });

  it('mostra o erro da API', async () => {
    save.mockResolvedValue({ ok: false, code: 'FORBIDDEN', message: 'Sem permissão para esta ação.' });
    renderEditor();
    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar Cassino' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão para esta ação.');
  });

  it('sem permissão de alterar: só consulta', () => {
    renderEditor(false);
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Subir/ })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Mostrar Cassino' })).toBeDisabled();
  });
});
