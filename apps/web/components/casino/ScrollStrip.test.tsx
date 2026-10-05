import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ScrollStrip from './ScrollStrip';

/** Faixa com 300px visíveis de 1000px de conteúdo (o jsdom não calcula layout). */
function strip(onPick = vi.fn()) {
  render(
    <ScrollStrip aria-label="Filtros">
      <button type="button" onClick={onPick}>
        PG SOFT
      </button>
    </ScrollStrip>,
  );
  const el = screen.getByLabelText('Filtros');
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 1000 });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: 300 });
  el.setPointerCapture = vi.fn();
  el.hasPointerCapture = vi.fn(() => true);
  el.releasePointerCapture = vi.fn();
  return el;
}

describe('ScrollStrip', () => {
  it('a roda do mouse rola a faixa; na ponta devolve a rolagem para a página', () => {
    const el = strip();
    expect(fireEvent.wheel(el, { deltaY: 120 })).toBe(false); // preventDefault: a página não rola
    expect(el.scrollLeft).toBe(120);
    el.scrollLeft = 0;
    expect(fireEvent.wheel(el, { deltaY: -120 })).toBe(true); // já no começo: a página rola
    expect(fireEvent.wheel(el, { deltaX: 50, deltaY: 10 })).toBe(true); // rolagem horizontal nativa
  });

  it('clicar e arrastar rola; o clique do fim do arrasto não aciona o filtro', () => {
    const pick = vi.fn();
    const el = strip(pick);
    const button = screen.getByRole('button', { name: 'PG SOFT' });
    fireEvent.pointerDown(el, { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(el, { pointerType: 'mouse', pointerId: 1, clientX: 120 });
    expect(el.scrollLeft).toBe(80);
    fireEvent.pointerUp(el, { pointerType: 'mouse', pointerId: 1, clientX: 120 });
    fireEvent.click(button);
    expect(pick).not.toHaveBeenCalled();

    // Clique sem arrasto continua funcionando.
    fireEvent.pointerDown(el, { pointerType: 'mouse', button: 0, pointerId: 2, clientX: 50 });
    fireEvent.pointerUp(el, { pointerType: 'mouse', pointerId: 2, clientX: 52 });
    fireEvent.click(button);
    expect(pick).toHaveBeenCalledOnce();
  });
});
