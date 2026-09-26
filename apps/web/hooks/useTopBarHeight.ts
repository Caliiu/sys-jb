'use client';

import { type RefObject, useEffect } from 'react';

/**
 * Publica a altura da barra superior em --topbar-height, para o menu lateral abrir logo abaixo
 * dela. A barra é `sticky` (CSS): o conteúdo nunca fica escondido atrás dela, mesmo antes do JS.
 */
export function useTopBarHeight(barRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--topbar-height', `${bar.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [barRef]);
}
