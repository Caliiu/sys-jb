'use client';

import { useSyncExternalStore } from 'react';

function subscribeToClock(onTick: () => void): () => void {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}

// Resolução de 1s: o valor só muda a cada segundo, evitando renderizações desnecessárias.
const nowInSeconds = () => Math.floor(Date.now() / 1000);
// No servidor não há relógio "ao vivo": o contador aparece só no navegador (sem divergência de hidratação).
const serverSnapshot = () => null;

/** "HH:MM:SS" até `target` (ISO 8601), atualizado a cada segundo. null durante a renderização no servidor. */
export function useCountdown(target: string): string | null {
  const now = useSyncExternalStore(subscribeToClock, nowInSeconds, serverSnapshot);
  if (now === null) return null;
  return formatCountdown(new Date(target).getTime() - now * 1000);
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
