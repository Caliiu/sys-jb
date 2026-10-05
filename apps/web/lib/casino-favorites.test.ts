import { describe, expect, it } from 'vitest';
import { MAX_CASINO_FAVORITES, parseCasinoFavorites, toggleCasinoFavorite } from './casino-favorites';

const game = (id: number) => ({
  id,
  name: `Jogo ${id}`,
  provider: 'PGSOFT',
  imageUrl: `https://cdn.example.test/${id}.png`,
});

describe('favoritos do cassino', () => {
  it('lê só o que tem formato de jogo, sem repetir', () => {
    const raw = JSON.stringify([
      game(1),
      game(1),
      { ...game(2), imageUrl: 'javascript:alert(1)' },
      { ...game(3), id: '3' },
      { ...game(4), provider: '<b>' },
      { ...game(5), name: '' },
      null,
    ]);
    expect(parseCasinoFavorites(raw)).toEqual([game(1), { ...game(2), imageUrl: null }]);
    expect(parseCasinoFavorites('{')).toEqual([]);
    expect(parseCasinoFavorites('{"a":1}')).toEqual([]);
    expect(parseCasinoFavorites(null)).toEqual([]);
  });

  it('marca no topo, desmarca e respeita o máximo', () => {
    expect(toggleCasinoFavorite([game(1)], game(2)).map((g) => g.id)).toEqual([2, 1]);
    expect(toggleCasinoFavorite([game(1), game(2)], game(1)).map((g) => g.id)).toEqual([2]);
    const full = Array.from({ length: MAX_CASINO_FAVORITES }, (_, i) => game(i + 1));
    const next = toggleCasinoFavorite(full, game(999));
    expect(next).toHaveLength(MAX_CASINO_FAVORITES);
    expect(next[0]!.id).toBe(999);
  });
});
