'use client';

import Image from 'next/image';
import { useToast } from '../ui/Toast';

const ITEMS = [
  { label: 'Horóscopo', icon: '/icons/horoscopo.png' },
  { label: 'Calcular', icon: '/icons/calcular.png' },
  { label: 'Sonhos', icon: '/icons/sonhos.png' },
  { label: 'Atrasados', icon: '/icons/atrasados.png' },
];

export default function UtilityTiles() {
  const toast = useToast();

  return (
    <div className="grid grid-cols-4 gap-1 px-4 mt-1">
      {ITEMS.map(({ label, icon }) => (
        <button
          key={label}
          type="button"
          onClick={() => toast.comingSoon(label)}
          className="flex flex-col items-center justify-center gap-1.5 h-20 rounded-xl2 bg-gradient-to-b from-brand-primary to-brand-primaryDark shadow-card active:scale-[0.97] transition-transform"
        >
          <Image src={icon} alt="" width={24} height={24} />
          <span className="text-white text-[10.5px] font-semibold leading-none text-center px-1">{label}</span>
        </button>
      ))}
    </div>
  );
}
