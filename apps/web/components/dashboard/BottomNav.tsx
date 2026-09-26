'use client';

import Image from 'next/image';
import Link from 'next/link';
import { BarChart2, FileText, DollarSign, Award } from 'lucide-react';
import { ROUTES } from '@/lib/routes';
import { useToast } from '../ui/Toast';

interface Tab {
  label: string;
  icon: typeof BarChart2;
  /** Sem rota, a aba avisa que a funcionalidade vem em breve. */
  to?: string;
}

const LEFT_TABS: Tab[] = [
  { label: 'Resultados', icon: BarChart2, to: ROUTES.results },
  { label: 'Relatórios', icon: FileText, to: ROUTES.reports },
];

const RIGHT_TABS: Tab[] = [
  { label: 'Saque', icon: DollarSign },
  { label: 'Premiadas', icon: Award, to: ROUTES.prizes },
];

const tabClass = 'flex flex-col items-center justify-center gap-1 flex-1 pt-2.5 pb-2';

/** Navegação inferior. Abas sem página ainda avisam "em breve". */
export default function BottomNav() {
  const toast = useToast();

  const renderTab = ({ label, icon: Icon, to }: Tab) => {
    const content = (
      <>
        <Icon className="w-5 h-5 text-white/70" strokeWidth={2} aria-hidden />
        <span className="text-[10px] font-medium text-white/70">{label}</span>
      </>
    );
    return to ? (
      <Link key={label} href={to} className={tabClass}>
        {content}
      </Link>
    ) : (
      <button key={label} type="button" onClick={() => toast.comingSoon(label)} className={tabClass}>
        {content}
      </button>
    );
  };

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed bottom-0 left-0 right-0 z-20 max-w-[480px] mx-auto bg-brand-primary flex items-center pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.2)]"
    >
      {LEFT_TABS.map(renderTab)}

      <div className="flex flex-col items-center justify-center flex-1 pt-2.5 pb-2 relative">
        <Link
          href={ROUTES.pixTopUp}
          aria-label="Recarga Pix"
          className="absolute -top-6 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-400 to-brand-teal shadow-lg flex items-center justify-center ring-4 ring-[#EDEDED] active:scale-95 transition-transform"
        >
          <Image src="/icons/pix.png" alt="" width={24} height={24} />
        </Link>
        <span className="text-[10px] font-medium text-white mt-8" aria-hidden>
          Recarga Pix
        </span>
      </div>

      {RIGHT_TABS.map(renderTab)}
    </nav>
  );
}
