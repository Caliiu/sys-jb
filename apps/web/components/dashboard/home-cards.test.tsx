import { screen } from '@testing-library/react';
import { DEFAULT_HOME_LAYOUT, type HomeLayoutCard } from '@sysjb/contracts';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MODALITIES } from '@/lib/modalities';
import { renderWithProviders, router } from '@/test/render';
import { arrangeCards } from './modality-tiles';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));

const { default: PrimaryTiles } = await import('./PrimaryTiles');
const { default: UtilityTiles } = await import('./UtilityTiles');
const { default: GamesGrid } = await import('./GamesGrid');

const cards = (...entries: Array<[string, boolean]>): HomeLayoutCard[] =>
  entries.map(([id, visible]) => ({ id, visible }));

describe('Cards do início no app do jogador', () => {
  it('arrangeCards: ordem do layout, só os visíveis; sem layout, a ordem padrão', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(arrangeCards(items, (i) => i.id, cards(['c', true], ['a', false], ['b', true]))).toEqual([
      { id: 'c' },
      { id: 'b' },
    ]);
    expect(arrangeCards(items, (i) => i.id)).toBe(items);
    // Card do layout que não existe na tela é ignorado.
    expect(arrangeCards(items, (i) => i.id, cards(['z', true], ['a', true]))).toEqual([{ id: 'a' }]);
  });

  it('Loterias e Fazendinha na ordem escolhida; com um só, ele ocupa a linha', () => {
    const { unmount } = renderWithProviders(
      <PrimaryTiles
        modalities={DEFAULT_MODALITIES}
        isLoading={false}
        cards={cards(['fazendinha', true], ['loterias', true])}
      />,
    );
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['FAZENDINHA', 'LOTERIAS']);
    unmount();

    renderWithProviders(
      <PrimaryTiles
        modalities={DEFAULT_MODALITIES}
        isLoading={false}
        cards={cards(['loterias', false], ['fazendinha', true])}
      />,
    );
    const [only] = screen.getAllByRole('link');
    expect(only).toHaveTextContent('FAZENDINHA');
    expect(only).toHaveClass('col-span-2');
  });

  it('atalhos: ordem escolhida, ocultos somem e os restantes ocupam a linha', () => {
    renderWithProviders(
      <UtilityTiles cards={cards(['sonhos', true], ['horoscopo', false], ['calcular', true], ['atrasados', true])} />,
    );
    const tiles = screen.getAllByRole('button').concat(screen.getAllByRole('link'));
    expect(tiles).toHaveLength(3);
    const grid = tiles[0]!.parentElement!;
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    expect(grid.textContent).toBe('SonhosCalcularAtrasados');
  });

  it('bloco sem nenhum card visível não aparece', () => {
    const { container } = renderWithProviders(
      <GamesGrid
        modalities={DEFAULT_MODALITIES}
        isLoading={false}
        cards={cards(['raspadinha', false], ['bingo', false])}
      />,
    );
    expect(container.querySelector('.grid')).toBeNull();
  });

  it('ordem padrão = a do app original', () => {
    renderWithProviders(<UtilityTiles cards={DEFAULT_HOME_LAYOUT.blocks.find((b) => b.id === 'utility')!.cards} />);
    expect(screen.getByText('Horóscopo').closest('.grid')!.textContent).toBe('HoróscopoCalcularSonhosAtrasados');
  });
});
