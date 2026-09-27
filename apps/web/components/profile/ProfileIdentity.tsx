'use client';

import { Copy, UserRound } from 'lucide-react';
import { shortName } from '@/lib/profile';
import { useToast } from '../ui/Toast';

interface ProfileIdentityProps {
  name: string;
  displayId: number;
}

/** Faixa do topo: nome curto e o ID do usuário, com botão para copiar. */
export default function ProfileIdentity({ name, displayId }: ProfileIdentityProps) {
  const toast = useToast();

  async function copyId() {
    try {
      await navigator.clipboard.writeText(String(displayId));
      toast.show('ID copiado.');
    } catch {
      toast.show('Não foi possível copiar o ID.');
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-brand-primary px-4 pb-4 pt-3">
      <div className="flex min-w-0 items-center gap-2 rounded-xl bg-white/15 pr-4 text-white">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/10">
          <UserRound className="h-5 w-5" />
        </span>
        <p className="truncate text-[15px] font-bold uppercase">{shortName(name)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2 text-white">
        <p className="text-[17px] font-extrabold tabular-nums">
          <span className="sr-only">ID </span>
          {displayId}
        </p>
        <button
          type="button"
          onClick={copyId}
          aria-label="Copiar ID"
          className="flex h-8 w-8 items-center justify-center rounded-lg active:scale-95 transition-transform"
        >
          <Copy className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
