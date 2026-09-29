'use client';

import type { PublicMural } from '@sysjb/contracts';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { markMuralSeenAction } from '@/app/mural-actions';
import { muralImage } from '@/lib/routes';
import BottomSheet, { useSheetClose } from '../ui/BottomSheet';

interface MuralSheetProps {
  /** Murais que o servidor mandou mostrar agora, na ordem (os "Apenas uma vez" já vistos nem chegam aqui). */
  murals: PublicMural[];
  userId: string;
}

const CHANGED_EVENT = 'sysjb:mural-shown-changed';

/**
 * "Sempre" = a cada abertura do app: os já fechados nesta aba ficam no sessionStorage, que o navegador apaga
 * quando a aba fecha. Assim o mural não volta a cada ida e volta ao Dashboard, mas volta ao abrir o app de novo.
 */
const storageKey = (userId: string) => `sysjb:mural-shown:${userId}`;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, onChange);
  return () => window.removeEventListener(CHANGED_EVENT, onChange);
}

function readShown(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null; // Sem armazenamento (navegação privada, bloqueio): o mural "Sempre" aparece de novo.
  }
}

function rememberShown(key: string, id: string): void {
  try {
    const list = parseShown(window.sessionStorage.getItem(key));
    if (!list.includes(id)) window.sessionStorage.setItem(key, JSON.stringify([...list, id]));
  } catch {
    // Sem armazenamento: nada a guardar.
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

function parseShown(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** "Fechar" desce a folha com a animação de saída antes de passar ao próximo mural. */
function CloseButton() {
  const close = useSheetClose();
  return (
    <button
      type="button"
      onClick={close}
      className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-brand-orange text-[16px] font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-orangeDark focus-visible:ring-offset-2"
    >
      Fechar
    </button>
  );
}

/**
 * Mural do Dashboard (folha inferior com a imagem e "Fechar", como no print). Com mais de um, mostra um depois
 * do outro. "Apenas uma vez" é registrado no servidor assim que aparece, valendo para qualquer aparelho.
 */
export default function MuralSheet({ murals, userId }: MuralSheetProps) {
  const titleId = useId();
  const key = storageKey(userId);
  // No servidor e antes de hidratar não há folha: ela só abre no navegador.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const shownRaw = useSyncExternalStore(
    subscribe,
    () => readShown(key),
    () => null,
  );
  const [closed, setClosed] = useState<string[]>([]);

  const shown = parseShown(shownRaw);
  const current = hydrated
    ? murals.find((m) => !closed.includes(m.id) && !(m.displayMode === 'ALWAYS' && shown.includes(m.id)))
    : undefined;

  useEffect(() => {
    if (current?.displayMode === 'ONCE') void markMuralSeenAction(current.id).catch(() => undefined);
  }, [current?.id, current?.displayMode]);

  function close() {
    if (!current) return;
    if (current.displayMode === 'ALWAYS') rememberShown(key, current.id);
    setClosed((list) => [...list, current.id]);
  }

  return (
    // key: cada mural da fila entra deslizando de novo. O foco vai para a folha (não destaca o "Fechar").
    <BottomSheet
      key={current?.id ?? 'none'}
      open={current !== undefined}
      onClose={close}
      titleId={titleId}
      initialFocus="panel"
    >
      {current && (
        <>
          <h2 id={titleId} className="sr-only">
            {current.name}
          </h2>
          {/* Imagem enviada pelo painel (tamanho livre): <img> simples, sem otimização do Next. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={current.id}
            src={muralImage(current.id, current.version)}
            alt={current.name}
            onError={close}
            className="max-h-[68dvh] w-full rounded-xl object-contain"
          />
          <CloseButton />
        </>
      )}
    </BottomSheet>
  );
}
