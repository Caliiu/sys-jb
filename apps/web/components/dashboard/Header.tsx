'use client';

import { Menu, X } from 'lucide-react';
import TenantLogo from '../tenant/TenantLogo';

interface HeaderProps {
  userName: string;
  unitId: string;
  menuOpen: boolean;
  menuId: string;
  onMenuClick: () => void;
}

export default function Header({ userName, unitId, menuOpen, menuId, onMenuClick }: HeaderProps) {
  return (
    <header className="flex items-center gap-3 bg-brand-primary px-4 py-3">
      <TenantLogo size={36} className="w-9 h-9 shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-white text-[13px] font-bold leading-tight truncate">Olá, {userName}</p>
        <p className="text-white/75 text-[11px] leading-tight">{unitId}</p>
      </div>

      <button
        type="button"
        onClick={onMenuClick}
        aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={menuOpen}
        aria-controls={menuId}
        className="w-9 h-9 rounded-md bg-white/10 flex items-center justify-center active:scale-95 transition-transform shrink-0"
      >
        {menuOpen ? (
          <X className="w-5 h-5 text-white" aria-hidden />
        ) : (
          <Menu className="w-5 h-5 text-white" aria-hidden />
        )}
      </button>
    </header>
  );
}
