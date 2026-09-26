'use client';

import { Menu, X } from 'lucide-react';

interface MenuButtonProps {
  open: boolean;
  /** id do painel controlado (o SideMenu). */
  controlsId: string;
  onClick: () => void;
}

/** Botão que abre/fecha o menu lateral, igual em todas as barras superiores. */
export default function MenuButton({ open, controlsId, onClick }: MenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? 'Fechar menu' : 'Abrir menu'}
      aria-expanded={open}
      aria-controls={controlsId}
      className="w-9 h-9 rounded-md bg-white/10 flex items-center justify-center active:scale-95 transition-transform shrink-0"
    >
      {open ? <X className="w-5 h-5 text-white" aria-hidden /> : <Menu className="w-5 h-5 text-white" aria-hidden />}
    </button>
  );
}
