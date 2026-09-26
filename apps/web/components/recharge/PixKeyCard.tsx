'use client';

import { Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type CopyState = 'idle' | 'copied' | 'failed';

/** Chave Pix "copia e cola" com botão de copiar. Sem permissão de área de transferência, seleciona o texto. */
export default function PixKeyCard({ code, disabled }: { code: string; disabled: boolean }) {
  const codeRef = useRef<HTMLParagraphElement>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copyState]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState('copied');
    } catch {
      if (codeRef.current) window.getSelection()?.selectAllChildren(codeRef.current);
      setCopyState('failed');
    }
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <p ref={codeRef} className="break-all text-center text-[12px] leading-relaxed text-slate-600 select-all">
        {code}
      </p>
      <button
        type="button"
        onClick={handleCopy}
        disabled={disabled}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-[color-mix(in_srgb,var(--brand-primary)_80%,white)] text-[15px] font-bold text-white shadow-[0_8px_20px_-6px_var(--brand-primary)] active:scale-[0.98] transition-transform disabled:opacity-50"
      >
        <Copy className="h-4 w-4" aria-hidden />
        {copyState === 'copied' ? 'Chave copiada!' : 'Copiar chave'}
      </button>
      <p role="status" className="sr-only">
        {copyState === 'copied' && 'Chave Pix copiada.'}
        {copyState === 'failed' && 'Não foi possível copiar. Copie a chave selecionada manualmente.'}
      </p>
      {copyState === 'failed' && (
        <p aria-hidden className="mt-2 text-center text-[12px] font-semibold text-red-700">
          Não foi possível copiar. Copie a chave selecionada manualmente.
        </p>
      )}
    </div>
  );
}
