'use client';

import { useCallback, useRef, useState } from 'react';
import { useTopBarHeight } from '@/hooks/useTopBarHeight';
import Header from './Header';
import SideMenu, { SIDE_MENU_ID } from './SideMenu';
import TopBanner from './TopBanner';

/** Barra superior (TopBanner + Header) e menu lateral. */
export default function TopBar({ userName, unitId }: { userName: string; unitId: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useTopBarHeight(barRef);

  return (
    <>
      <div ref={barRef} className="sticky top-0 z-30">
        <TopBanner />
        <Header
          userName={userName}
          unitId={unitId}
          menuOpen={menuOpen}
          menuId={SIDE_MENU_ID}
          onMenuClick={() => setMenuOpen((v) => !v)}
        />
      </div>
      <SideMenu id={SIDE_MENU_ID} open={menuOpen} onClose={closeMenu} />
    </>
  );
}
