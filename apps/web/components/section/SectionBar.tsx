'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { useTopBarHeight } from '@/hooks/useTopBarHeight';
import { ROUTES } from '@/lib/routes';
import TopBanner from '../dashboard/TopBanner';
import SideMenu, { SIDE_MENU_ID } from '../dashboard/SideMenu';
import MenuButton from '../ui/MenuButton';

/** Barra superior das telas internas: convite, botão voltar, título centralizado e menu lateral. */
export default function SectionBar({ title }: { title: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useTopBarHeight(barRef);

  return (
    <>
      <div ref={barRef} className="sticky top-0 z-30">
        <TopBanner />
        <header className="flex items-center gap-3 bg-brand-primary px-3 py-3">
          <Link
            href={ROUTES.home}
            aria-label="Voltar ao início"
            className="w-9 h-9 flex items-center justify-center shrink-0 active:scale-95 transition-transform"
          >
            <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.5} aria-hidden />
          </Link>
          <h1 className="flex-1 text-center text-white text-[17px] font-bold leading-tight truncate">{title}</h1>
          <MenuButton open={menuOpen} controlsId={SIDE_MENU_ID} onClick={() => setMenuOpen((v) => !v)} />
        </header>
      </div>
      <SideMenu id={SIDE_MENU_ID} open={menuOpen} onClose={closeMenu} />
    </>
  );
}
