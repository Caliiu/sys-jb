'use client';

import { Sparkles, Grid3x3, Moon, History } from 'lucide-react';
import { useToast } from '../ui/Toast';

const ITEMS = [
  { label: 'Horóscopo', icon: Sparkles },
  { label: 'Calcular', icon: Grid3x3 },
  { label: 'Sonhos', icon: Moon },
  { label: 'Atrasados', icon: History },
];

export default function UtilityTiles() {
  const toast = useToast();

  return (
    <div className="grid grid-cols-4 gap-1 px-4 mt-1">
      {ITEMS.map(({ label, icon: Icon }) => (
        <button
          key={label}
          type="button"
          onClick={() => toast.comingSoon(label)}
          className="flex flex-col items-center justify-center gap-1.5 h-20 rounded-xl2 bg-gradient-to-b from-brand-primary to-brand-primaryDark shadow-card active:scale-[0.97] transition-transform"
        >
          <Icon className="w-5 h-5 text-white" strokeWidth={2} aria-hidden />
          <span className="text-white text-[10.5px] font-semibold leading-none text-center px-1">{label}</span>
        </button>
      ))}
    </div>
  );
}
