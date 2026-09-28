'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { useToast } from '../ui/Toast';

/** Sem rota, o atalho avisa que a ferramenta vem em breve. */
const ITEMS: Array<{ label: string; icon: string; href?: string }> = [
  { label: 'Horóscopo', icon: '/icons/horoscopo.png' },
  { label: 'Calcular', icon: '/icons/calcular.png', href: ROUTES.prizeCalculator },
  { label: 'Sonhos', icon: '/icons/sonhos.png' },
  { label: 'Atrasados', icon: '/icons/atrasados.png' },
];

const tileClass =
  'flex flex-col items-center justify-center gap-1.5 h-20 rounded-xl2 bg-gradient-to-b from-brand-primary to-brand-primaryDark shadow-card active:scale-[0.97] transition-transform';

export default function UtilityTiles() {
  const toast = useToast();

  return (
    <div className="grid grid-cols-4 gap-1 px-4 mt-1">
      {ITEMS.map(({ label, icon, href }) => {
        const content = (
          <>
            <Image src={icon} alt="" width={24} height={24} />
            <span className="text-white text-[10.5px] font-semibold leading-none text-center px-1">{label}</span>
          </>
        );
        return href ? (
          <Link key={label} href={href} className={tileClass}>
            {content}
          </Link>
        ) : (
          <button key={label} type="button" onClick={() => toast.comingSoon(label)} className={tileClass}>
            {content}
          </button>
        );
      })}
    </div>
  );
}
