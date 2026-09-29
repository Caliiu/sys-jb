'use client';

import { FileText } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { ROUTES } from '@/lib/routes';

interface ReceiptActionsProps {
  onShare: () => Promise<void>;
  /** Ações entre Compartilhar e o link final (ex.: Cancelar pule). */
  children?: ReactNode;
  /** Link final. Padrão: Voltar ao início. */
  exit?: { href: string; label: string };
}

const HOME = { href: ROUTES.home, label: 'Voltar ao início' };

/** Rodapé fixo dos comprovantes: Compartilhar (gera o PDF), ações extras e o link de saída. */
export default function ReceiptActions({ onShare, children, exit = HOME }: ReceiptActionsProps) {
  const [sharing, setSharing] = useState(false);

  async function share() {
    setSharing(true);
    try {
      await onShare();
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="sticky bottom-0 bg-white px-2 pt-3 pb-3 space-y-2">
      <button
        type="button"
        onClick={share}
        disabled={sharing}
        aria-busy={sharing}
        className="w-full h-14 flex items-center justify-center gap-2 rounded-xl bg-brand-green text-white text-[17px] font-bold active:scale-[0.99] transition-transform disabled:opacity-70"
      >
        <FileText className="w-5 h-5" aria-hidden />
        Compartilhar
      </button>
      {children}
      <Link
        href={exit.href}
        className="w-full h-14 flex items-center justify-center rounded-xl bg-brand-orange text-white text-[17px] font-bold active:scale-[0.99] transition-transform"
      >
        {exit.label}
      </Link>
    </div>
  );
}
