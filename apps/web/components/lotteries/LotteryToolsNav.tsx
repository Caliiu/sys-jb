'use client';

import { Calculator, Moon, Sparkles, Timer } from 'lucide-react';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { useToast } from '../ui/Toast';

const itemClass = 'flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-white';

/**
 * Barra de ferramentas das Loterias (fixa no rodapé, na cor da banca): Prêmio, Horóscopo, Sonhos e Atrasados.
 * Prêmio abre o simulador; as outras ainda avisam "em breve". `active` marca a ferramenta da página atual.
 */
export default function LotteryToolsNav({ active }: { active?: 'prize' }) {
  const toast = useToast();
  const prizeActive = active === 'prize';

  return (
    <nav
      aria-label="Ferramentas"
      className="fixed bottom-0 left-0 right-0 z-20 mx-auto flex max-w-[480px] bg-brand-primary pb-[env(safe-area-inset-bottom)]"
    >
      <Link
        href={ROUTES.prizeCalculator}
        aria-current={prizeActive ? 'page' : undefined}
        className={`${itemClass} ${prizeActive ? 'bg-black/10' : ''}`}
      >
        <Calculator className="w-5 h-5" aria-hidden />
        <span className="text-[11px] font-semibold">Prêmio</span>
      </Link>
      {[
        { label: 'Horóscopo', icon: Sparkles },
        { label: 'Sonhos', icon: Moon },
        { label: 'Atrasados', icon: Timer },
      ].map(({ label, icon: Icon }) => (
        <button key={label} type="button" onClick={() => toast.comingSoon(label)} className={itemClass}>
          <Icon className="w-5 h-5" aria-hidden />
          <span className="text-[11px] font-semibold">{label}</span>
        </button>
      ))}
    </nav>
  );
}
