'use client';

import { type ReactNode, useCallback, useRef, useState } from 'react';
import { useTopBarHeight } from '@/hooks/useTopBarHeight';
import { ROUTES } from '@/lib/routes';
import TopBanner from '../dashboard/TopBanner';
import SideMenu, { SIDE_MENU_ID } from '../dashboard/SideMenu';
import BackButton, { type BackAction } from '../ui/BackButton';
import MenuButton from '../ui/MenuButton';

const BACK_TO_HOME: BackAction = { href: ROUTES.home, label: 'Voltar ao início' };

interface SectionBarProps {
  title: string;
  /** Padrão: volta ao início. */
  back?: BackAction;
  /** Bloco fixo logo abaixo do título (ex.: indicador de etapas). */
  children?: ReactNode;
}

/** Barra superior das telas internas: convite, botão voltar, título centralizado e menu lateral. */
export default function SectionBar({ title, back = BACK_TO_HOME, children }: SectionBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useTopBarHeight(barRef);

  return (
    <>
      <div ref={barRef} className="sticky top-0 z-30">
        <TopBanner />
        <header className="flex items-center gap-3 bg-brand-primary px-3 py-3">
          <BackButton back={back} />
          <h1 className="flex-1 text-center text-white text-[17px] font-bold leading-tight truncate">{title}</h1>
          <MenuButton open={menuOpen} controlsId={SIDE_MENU_ID} onClick={() => setMenuOpen((v) => !v)} />
        </header>
        {children}
      </div>
      <SideMenu id={SIDE_MENU_ID} open={menuOpen} onClose={closeMenu} />
    </>
  );
}
