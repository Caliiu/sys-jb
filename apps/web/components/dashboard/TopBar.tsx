'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Header from './Header';
import SideMenu from './SideMenu';
import TopBanner from './TopBanner';

const MENU_ID = 'side-menu';

/**
 * Barra superior (TopBanner + Header) e menu lateral.
 * A barra é `sticky` (CSS): o conteúdo nunca fica escondido atrás dela, mesmo antes do JS carregar.
 * A altura é publicada em --topbar-height só para o menu abrir logo abaixo da barra.
 */
export default function TopBar({ userName, unitId }: { userName: string; unitId: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--topbar-height', `${bar.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={barRef} className="sticky top-0 z-30">
        <TopBanner />
        <Header
          userName={userName}
          unitId={unitId}
          menuOpen={menuOpen}
          menuId={MENU_ID}
          onMenuClick={() => setMenuOpen((v) => !v)}
        />
      </div>
      <SideMenu id={MENU_ID} open={menuOpen} onClose={closeMenu} />
    </>
  );
}
