'use client';

import { type PointerEvent, type RefObject, useRef, useState } from 'react';

/** Fecha se arrastar mais que isto (px) ou que 25% da altura da folha, o que for menor. */
const CLOSE_DISTANCE = 120;
/** ...ou se soltar num movimento rápido para baixo (px/ms). */
const CLOSE_VELOCITY = 0.6;

/**
 * Arrastar para baixo para fechar uma folha inferior (dedo ou mouse). Liga os handlers na faixa de arrastar
 * (SheetHandle) e aplica `dragStyle` no painel: ele acompanha o movimento, só para baixo. Ao soltar além do
 * limite (ou num puxão rápido) chama `onDismiss`; antes disso, volta para o lugar.
 */
export function useSheetDrag({
  enabled,
  panelRef,
  onDismiss,
}: {
  enabled: boolean;
  panelRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}) {
  const start = useRef<{ y: number; time: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  function reset() {
    start.current = null;
    setDragging(false);
    setOffset(0);
  }

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!enabled) return;
      start.current = { y: event.clientY, time: performance.now() };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDragging(true);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!start.current) return;
      setOffset(Math.max(0, event.clientY - start.current.y));
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const from = start.current;
      if (!from) return;
      const distance = Math.max(0, event.clientY - from.y);
      const velocity = distance / Math.max(1, performance.now() - from.time);
      const height = panelRef.current?.offsetHeight ?? 0;
      const limit = height > 0 ? Math.min(CLOSE_DISTANCE, height * 0.25) : CLOSE_DISTANCE;
      reset();
      if (distance > limit || (distance > 10 && velocity > CLOSE_VELOCITY)) onDismiss();
    },
    onPointerCancel: reset,
  };

  /**
   * Estilo do painel durante o arrasto (sem animação, segue o dedo). Fora do arrasto não interfere: o painel
   * volta (ou sai) com a transição dele.
   */
  const dragStyle = dragging && offset > 0 ? { transform: `translateY(${offset}px)`, transition: 'none' } : undefined;

  return { handlers, dragging, offset, dragStyle };
}
