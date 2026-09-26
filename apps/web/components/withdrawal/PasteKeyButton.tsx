'use client';

import { ClipboardPaste } from 'lucide-react';

interface PasteKeyButtonProps {
  /** Texto da área de transferência (a tela normaliza e valida). */
  onPaste: (text: string) => void;
  /** Sem permissão ou sem texto: a tela orienta a colar manualmente. */
  onFail: () => void;
}

/** "Colar": lê a área de transferência. Pode ser negado (permissão, contexto não seguro): sempre há o colar manual. */
export default function PasteKeyButton({ onPaste, onFail }: PasteKeyButtonProps) {
  async function handleClick() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) onPaste(text);
      else onFail();
    } catch {
      onFail();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[13px] font-bold text-brand-primary"
    >
      <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
      Colar
    </button>
  );
}
