'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useTopBarHeight } from '@/hooks/useTopBarHeight';
import { formatCents } from '@/lib/currency';
import SideMenu, { SIDE_MENU_ID } from '../dashboard/SideMenu';
import TenantLogo from '../tenant/TenantLogo';
import BackButton, { type BackAction } from '../ui/BackButton';
import MenuButton from '../ui/MenuButton';

interface RechargeBarProps {
  title: string;
  /** Etapa atual (1 ou 2) do indicador de progresso. */
  step: 1 | 2;
  /** Botão voltar: leva a outra página (href) ou volta a etapa da própria tela (onClick). */
  back: BackAction;
  balanceCents: number;
  balanceVisible: boolean;
  onToggleBalance: () => void;
}

/** Barra superior da recarga: logo, saldo (com ocultar), menu, título e indicador de etapas. */
export default function RechargeBar({
  title,
  step,
  back,
  balanceCents,
  balanceVisible,
  onToggleBalance,
}: RechargeBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useTopBarHeight(barRef);

  return (
    <>
      <div ref={barRef} className="sticky top-0 z-30 bg-brand-primary">
        <div className="flex items-center gap-3 px-4 py-3">
          <TenantLogo size={36} className="w-9 h-9 shrink-0" />
          <div className="flex-1" />
          <div className="flex items-center gap-1.5" aria-live="polite">
            <span className="text-[14px] font-bold text-white tabular-nums">
              R$ {balanceVisible ? formatCents(balanceCents) : '••••'}
            </span>
            <button
              type="button"
              onClick={onToggleBalance}
              aria-label={balanceVisible ? 'Ocultar saldo' : 'Mostrar saldo'}
              aria-pressed={!balanceVisible}
              className="w-7 h-7 flex items-center justify-center active:scale-95 transition-transform"
            >
              {balanceVisible ? (
                <Eye className="w-4 h-4 text-white/80" aria-hidden />
              ) : (
                <EyeOff className="w-4 h-4 text-white/80" aria-hidden />
              )}
            </button>
          </div>
          <MenuButton open={menuOpen} controlsId={SIDE_MENU_ID} onClick={() => setMenuOpen((v) => !v)} />
        </div>

        <div className="flex items-center gap-2 px-3 pb-3">
          <BackButton back={back} />
          <h1 className="text-white text-[19px] font-bold leading-tight">{title}</h1>
        </div>

        <div className="flex gap-2 px-3.5 pb-3" role="img" aria-label={`Etapa ${step} de 2`}>
          <span className="h-[3px] flex-1 rounded-full bg-white" />
          <span className={`h-[3px] flex-1 rounded-full ${step === 2 ? 'bg-white' : 'bg-white/30'}`} />
        </div>
      </div>
      <SideMenu id={SIDE_MENU_ID} open={menuOpen} onClose={closeMenu} />
    </>
  );
}
