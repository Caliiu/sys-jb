'use client';

import type { PublicWallet } from '@sysjb/contracts';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { formatCents } from '@/lib/currency';
import { balanceAmounts } from '@/lib/wallet';

/** Saldo compacto da barra superior; o toque oculta/mostra o valor. */
export default function BalancePill({ wallet }: { wallet: PublicWallet }) {
  const [visible, setVisible] = useState(true);

  return (
    <button
      type="button"
      onClick={() => setVisible((v) => !v)}
      aria-label={visible ? 'Ocultar saldo' : 'Mostrar saldo'}
      aria-pressed={!visible}
      className="h-9 flex items-center gap-2 rounded-md bg-white/10 px-3 text-white active:scale-95 transition-transform shrink-0"
    >
      {visible ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
      <span className="text-[15px] font-bold tabular-nums">
        {visible ? formatCents(balanceAmounts(wallet).main) : '••••'}
      </span>
    </button>
  );
}
