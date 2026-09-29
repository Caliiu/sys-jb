'use client';

import type { PublicWallet } from '@sysjb/contracts';
import { useCallback, useRef, useState } from 'react';
import { useTopBarHeight } from '@/hooks/useTopBarHeight';
import SideMenu, { SIDE_MENU_ID } from '../dashboard/SideMenu';
import TopBanner from '../dashboard/TopBanner';
import BalancePill from '../fazendinha/BalancePill';
import TenantLogo from '../tenant/TenantLogo';
import BackButton, { type BackAction } from '../ui/BackButton';
import MenuButton from '../ui/MenuButton';

/** Etapas com barra de progresso (Nova aposta … Carrinho); Finalizar e o recibo não mostram a barra. */
export const LOTTERY_STEP_COUNT = 9;

interface LotteryBarProps {
  title: string;
  back: BackAction;
  wallet: PublicWallet;
  /** Nome e ID do jogador, como no cabeçalho do dashboard. */
  userName: string;
  displayId: number;
  /** Etapa atual (1 a stepCount); sem ela, não mostra a barra de progresso. */
  step?: number;
  /** Quantidade de etapas da barra de progresso. */
  stepCount?: number;
}

/** Topo das Loterias: convite; logo, nome e ID do jogador, saldo e menu; voltar, título e as etapas do fluxo. */
export default function LotteryBar({
  title,
  back,
  wallet,
  userName,
  displayId,
  step,
  stepCount = LOTTERY_STEP_COUNT,
}: LotteryBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useTopBarHeight(barRef);

  return (
    <>
      <div ref={barRef} className="sticky top-0 z-30 bg-brand-primary">
        <TopBanner />
        <div className="px-3 pt-3 pb-3">
          <div className="flex items-center gap-2">
            <TenantLogo size={36} className="w-9 h-9 shrink-0" decorative />
            <div className="flex-1 min-w-0">
              <p className="text-white text-[13px] font-bold leading-tight truncate">Olá, {userName}</p>
              <p className="text-white/75 text-[11px] leading-tight">{displayId}</p>
            </div>
            <BalancePill wallet={wallet} />
            <MenuButton open={menuOpen} controlsId={SIDE_MENU_ID} onClick={() => setMenuOpen((v) => !v)} />
          </div>
          <div className="mt-2 flex items-center gap-1">
            <BackButton back={back} />
            <h1 className="text-[19px] font-bold text-white truncate">{title}</h1>
          </div>
          {step !== undefined && (
            <ol
              aria-label={`Etapa ${step} de ${stepCount}`}
              className="mt-3 grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: stepCount }, (_, i) => (
                <li key={i} aria-hidden className={`h-[3px] rounded-full ${i < step ? 'bg-white' : 'bg-white/30'}`} />
              ))}
            </ol>
          )}
        </div>
      </div>
      <SideMenu id={SIDE_MENU_ID} open={menuOpen} onClose={closeMenu} />
    </>
  );
}
