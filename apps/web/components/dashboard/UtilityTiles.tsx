'use client';

import type { HomeLayoutCard } from '@sysjb/contracts';
import Image from 'next/image';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { useToast } from '../ui/Toast';
import { arrangeCards } from './modality-tiles';

/** Sem rota, o atalho avisa que a ferramenta vem em breve. */
const ITEMS: Array<{ id: string; label: string; icon: string; href?: string }> = [
  { id: 'horoscopo', label: 'Horóscopo', icon: '/icons/horoscopo.png', href: ROUTES.horoscope },
  { id: 'calcular', label: 'Calcular', icon: '/icons/calcular.png', href: ROUTES.prizeCalculator },
  { id: 'sonhos', label: 'Sonhos', icon: '/icons/sonhos.png' },
  { id: 'atrasados', label: 'Atrasados', icon: '/icons/atrasados.png' },
];

const tileClass =
  'flex flex-col items-center justify-center gap-1.5 h-20 rounded-xl2 bg-gradient-to-b from-brand-primary to-brand-primaryDark shadow-card active:scale-[0.97] transition-transform';

/** Atalhos; `cards` = ordem e visibilidade definidas pelo Gerente. Com menos de 4, os que sobram ocupam a linha. */
export default function UtilityTiles({ cards }: { cards?: HomeLayoutCard[] }) {
  const toast = useToast();
  const items = arrangeCards(ITEMS, (item) => item.id, cards);
  if (items.length === 0) return null;

  return (
    <div className="grid gap-1 px-4 mt-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map(({ label, icon, href }) => {
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
