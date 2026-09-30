'use client';

import { Calculator, Moon, Sparkles, Timer } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ROUTES } from '@/lib/routes';
import { useToast } from '../ui/Toast';

const itemClass = 'flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-white';

type Tool = 'prize' | 'horoscope';

const LINKS: Array<{ id: Tool; label: string; href: string; icon: typeof Calculator }> = [
  { id: 'prize', label: 'Prêmio', href: ROUTES.prizeCalculator, icon: Calculator },
  { id: 'horoscope', label: 'Horóscopo', href: ROUTES.horoscope, icon: Sparkles },
];

const COMING_SOON = [
  { label: 'Sonhos', icon: Moon },
  { label: 'Atrasados', icon: Timer },
];

/**
 * Barra de ferramentas das Loterias (fixa no rodapé, na cor da banca): Prêmio, Horóscopo, Sonhos e Atrasados.
 * Prêmio e Horóscopo abrem as páginas deles; as outras ainda avisam "em breve". `active` marca a ferramenta da página
 * atual; `above` fica fixo logo acima da barra (ex.: os signos do Horóscopo).
 */
export default function LotteryToolsNav({ active, above }: { active?: Tool; above?: ReactNode }) {
  const toast = useToast();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-[480px]">
      {above}
      <nav aria-label="Ferramentas" className="flex bg-brand-primary pb-[env(safe-area-inset-bottom)]">
        {LINKS.map(({ id, label, href, icon: Icon }) => (
          <Link
            key={id}
            href={href}
            aria-current={active === id ? 'page' : undefined}
            className={`${itemClass} ${active === id ? 'bg-black/10' : ''}`}
          >
            <Icon className="w-5 h-5" aria-hidden />
            <span className="text-[11px] font-semibold">{label}</span>
          </Link>
        ))}
        {COMING_SOON.map(({ label, icon: Icon }) => (
          <button key={label} type="button" onClick={() => toast.comingSoon(label)} className={itemClass}>
            <Icon className="w-5 h-5" aria-hidden />
            <span className="text-[11px] font-semibold">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
