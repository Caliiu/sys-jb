'use client';

import { type RefCallback, useCallback, useRef } from 'react';

/** Distância (px) que o mouse precisa andar para virar arrasto (e não clique). */
const DRAG_THRESHOLD = 6;

/**
 * Faixa que rola na horizontal também no computador: a roda do mouse (vertical) passa a rolar a faixa e dá para
 * clicar e arrastar. No toque nada muda (o navegador já rola com o dedo). Na ponta da faixa, a roda volta a rolar a
 * página. Um arrasto não vira clique no card ou filtro em que terminou.
 */
export function useHorizontalScroll<T extends HTMLElement>(): RefCallback<T> {
  const cleanup = useRef<(() => void) | null>(null);

  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const atStart = el.scrollLeft <= 0 && event.deltaY < 0;
      const atEnd = el.scrollLeft >= max - 1 && event.deltaY > 0;
      if (atStart || atEnd) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };

    let startX = 0;
    let startScroll = 0;
    let pointer: number | null = null;
    let dragged = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      pointer = event.pointerId;
      startX = event.clientX;
      startScroll = el.scrollLeft;
      dragged = false;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const dx = event.clientX - startX;
      if (!dragged && Math.abs(dx) < DRAG_THRESHOLD) return;
      if (!dragged) {
        dragged = true;
        el.setPointerCapture?.(event.pointerId);
        el.style.cursor = 'grabbing';
      }
      el.scrollLeft = startScroll - dx;
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      el.style.cursor = '';
      if (el.hasPointerCapture?.(event.pointerId)) el.releasePointerCapture(event.pointerId);
    };
    // O clique que encerra um arrasto não abre o jogo nem troca o filtro.
    const onClick = (event: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const onDragStart = (event: DragEvent) => event.preventDefault();

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('click', onClick, true);
    el.addEventListener('dragstart', onDragStart);
    cleanup.current = () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerEnd);
      el.removeEventListener('pointercancel', onPointerEnd);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('dragstart', onDragStart);
    };
  }, []);
}
