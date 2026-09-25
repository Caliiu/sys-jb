'use client';

import { RefreshCw, EyeOff, Eye, Grid2x2, AlertTriangle } from 'lucide-react';
import type { PublicWallet } from '@sysjb/contracts';
import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { formatCents } from '@/lib/currency';
import { useInvite } from './InviteProvider';

/**
 * Mapeamento da carteira pública para os três valores do card original (bolsas LOTERIAS,
 * BONUS e GAMES). Tudo em centavos.
 */
export function balanceAmounts(wallet: PublicWallet) {
  return {
    main: wallet.balanceJb + wallet.prizesJb,
    bonus: wallet.bonusJb,
    games: wallet.totalAvailableGames,
  };
}

export default function BalanceCard({ initialWallet }: { initialWallet: PublicWallet }) {
  const [visible, setVisible] = useState(true);
  const { wallet, error, refresh } = useWallet(initialWallet);
  const { openInvite } = useInvite();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const amounts = balanceAmounts(wallet);

  // "—" em erro é proposital: nunca mostrar "0,00" quando na verdade não
  // sabemos o saldo (fetch falhou), pra não parecer que o dinheiro sumiu
  const amount = (cents: number) => {
    if (!visible) return '••••';
    if (error) return '—';
    return formatCents(cents);
  };

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <section aria-label="Saldo" className="px-4 pt-4 pb-1 bg-[#EDEDED]">
      <span className="text-[13px] text-gray-500 font-medium">Saldo</span>

      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-2" aria-live="polite">
          <span className="flex items-center gap-1">
            <span className="text-[15px] font-bold text-gray-900">R$</span>
            <span className="text-[24px] font-extrabold text-gray-900 tabular-nums">{amount(amounts.main)}</span>
          </span>
          <span className="text-[11px] font-semibold text-brand-teal bg-brand-teal/10 border border-brand-teal/30 rounded-full px-2 py-0.5">
            BÔNUS + R$ {amount(amounts.bonus)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Atualizar saldo"
            className={`w-7 h-7 rounded-full bg-white shadow-card flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60 ${
              error ? 'ring-2 ring-brand-primary' : ''
            }`}
          >
            <RefreshCw
              aria-hidden
              className={`w-3.5 h-3.5 ${error ? 'text-brand-primary' : 'text-gray-600'} ${isRefreshing ? 'animate-spin' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Ocultar saldo' : 'Mostrar saldo'}
            aria-pressed={!visible}
            className="w-7 h-7 rounded-full bg-white shadow-card flex items-center justify-center active:scale-95 transition-transform"
          >
            {visible ? (
              <Eye className="w-3.5 h-3.5 text-gray-600" aria-hidden />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-gray-600" aria-hidden />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pb-3 border-b border-gray-300">
        <span className="text-[13px] text-gray-500">Disp. Games</span>
        <span className="text-[13px] font-bold text-gray-900 tabular-nums">R$ {amount(amounts.games)}</span>
      </div>

      {error && (
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 text-[11.5px] font-semibold text-brand-primary mt-2 disabled:opacity-60"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
          Não foi possível carregar seu saldo. Toque para tentar novamente.
        </button>
      )}

      <button
        type="button"
        onClick={openInvite}
        className="w-full flex items-center justify-between mt-2 border border-brand-primary rounded-xl2 px-4 py-5 active:scale-[0.98] transition-transform"
      >
        <span className="text-[13px] font-bold text-brand-primary">Ganhe convidando seus amigos</span>
        <Grid2x2 className="w-4.5 h-4.5 text-brand-primary" size={18} aria-hidden />
      </button>
    </section>
  );
}
