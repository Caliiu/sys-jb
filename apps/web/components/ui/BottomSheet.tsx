'use client';

import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useOverlay } from '@/hooks/useOverlay';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** id do título dentro do conteúdo (aria-labelledby). */
  titleId: string;
  /** false: Esc, toque fora e arrastar não fecham (ex.: enquanto um envio está em andamento). */
  dismissible?: boolean;
  children: ReactNode;
}

/** Duração da animação de saída / volta (ms). */
const ANIMATION_MS = 200;
/** Fecha se arrastar mais que isto (px) ou que 25% da altura da folha, o que for menor. */
const CLOSE_DISTANCE = 120;
/** ...ou se soltar num movimento rápido para baixo (px/ms). */
const CLOSE_VELOCITY = 0.6;

/**
 * Folha inferior acessível: Esc fecha, o foco entra no painel e volta para quem abriu, a página não rola.
 * Arrastar a barrinha do topo para baixo fecha (com o dedo ou o mouse); soltar antes do limite volta.
 */
export default function BottomSheet({ open, onClose, titleId, dismissible = true, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startTime: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  // Saiu da tela no meio da animação (ex.: navegação): não chama onClose depois.
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const close = () => {
    if (dismissible) onClose();
  };
  useOverlay(open, close, panelRef);

  /** Desce a folha até sair da tela e só então fecha (o estado volta ao normal para a próxima abertura). */
  function animateClose() {
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setClosing(false);
      setOffset(0);
      onClose();
    }, ANIMATION_MS);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!dismissible || closing) return;
    drag.current = { startY: event.clientY, startTime: performance.now() };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    // Só para baixo: puxar para cima não mexe na folha.
    setOffset(Math.max(0, event.clientY - drag.current.startY));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    drag.current = null;
    setDragging(false);
    const distance = Math.max(0, event.clientY - start.startY);
    const velocity = distance / Math.max(1, performance.now() - start.startTime);
    const height = panelRef.current?.offsetHeight ?? 0;
    const limit = height > 0 ? Math.min(CLOSE_DISTANCE, height * 0.25) : CLOSE_DISTANCE;
    if (distance > limit || (distance > 10 && velocity > CLOSE_VELOCITY)) animateClose();
    else setOffset(0);
  }

  function onPointerCancel() {
    drag.current = null;
    setDragging(false);
    setOffset(0);
  }

  if (!open) return null;

  const transform = closing ? 'translateY(100%)' : `translateY(${offset}px)`;
  const transition = dragging ? 'none' : `transform ${ANIMATION_MS}ms ease-out`;

  return (
    <div
      onClick={close}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 transition-opacity"
      style={{ opacity: closing ? 0 : 1, transitionDuration: `${ANIMATION_MS}ms` }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        style={{ transform, transition }}
        className="w-full max-w-[480px] rounded-t-2xl bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        {/* Área de arrastar: a faixa toda do topo, não só a barrinha (mais fácil de pegar no celular). */}
        <div
          data-sheet-handle
          aria-hidden
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className={`-mx-5 flex justify-center pt-3 pb-4 touch-none select-none ${
            dismissible ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
        >
          <span className="block h-1 w-10 rounded-full bg-gray-300" />
        </div>
        {children}
      </div>
    </div>
  );
}
