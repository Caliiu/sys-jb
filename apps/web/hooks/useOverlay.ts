'use client';

import { type RefObject, useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportamento padrão de menus e modais sobrepostos:
 * - Esc fecha;
 * - ao abrir, o foco vai para o primeiro elemento do painel (ou para o painel); ao fechar, volta para quem abriu;
 * - a página por trás não rola enquanto estiver aberto.
 * O painel fechado deve receber `inert` (fora do Tab e dos leitores de tela).
 */
export function useOverlay(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
  /** 'panel': o foco vai para o próprio painel (tabIndex={-1}), sem destacar nenhum botão ao abrir. */
  initialFocus: 'first' | 'panel' = 'first',
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // preventScroll: o painel ainda está entrando (fora da tela); sem isso o navegador rola para mostrar o
    // item focado e a tela "treme" no meio da animação.
    const target =
      initialFocus === 'panel' ? panelRef.current : panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus({ preventScroll: true });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, panelRef, initialFocus]);
}
