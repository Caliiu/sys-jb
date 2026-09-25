'use client';

import Image from 'next/image';
import { BarChart2, FileText, DollarSign, Award } from 'lucide-react';
import { useToast } from '../ui/Toast';

const LEFT_TABS = [
  { label: 'Resultados', icon: BarChart2 },
  { label: 'Relatórios', icon: FileText },
];

const RIGHT_TABS = [
  { label: 'Saque', icon: DollarSign },
  { label: 'Premiadas', icon: Award },
];

/**
 * Navegação inferior (visual do original). No original as abas só trocavam o destaque, sem
 * navegar; aqui, enquanto as seções não existem, cada uma avisa que vem em breve.
 */
export default function BottomNav() {
  const toast = useToast();

  const renderTab = (label: string, Icon: typeof BarChart2) => (
    <button
      key={label}
      type="button"
      onClick={() => toast.comingSoon(label)}
      className="flex flex-col items-center justify-center gap-1 flex-1 pt-2.5 pb-2"
    >
      <Icon className="w-5 h-5 text-white/70" strokeWidth={2} aria-hidden />
      <span className="text-[10px] font-medium text-white/70">{label}</span>
    </button>
  );

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed bottom-0 left-0 right-0 z-20 max-w-[480px] mx-auto bg-brand-primary flex items-center pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.2)]"
    >
      {LEFT_TABS.map((t) => renderTab(t.label, t.icon))}

      <div className="flex flex-col items-center justify-center flex-1 pt-2.5 pb-2 relative">
        <button
          type="button"
          onClick={() => toast.comingSoon('Recarga Pix')}
          aria-label="Recarga Pix"
          className="absolute -top-6 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-400 to-brand-teal shadow-lg flex items-center justify-center ring-4 ring-[#EDEDED] active:scale-95 transition-transform"
        >
          <Image src="/icons/pix.png" alt="" width={24} height={24} />
        </button>
        <span className="text-[10px] font-medium text-white mt-8" aria-hidden>
          Recarga Pix
        </span>
      </div>

      {RIGHT_TABS.map((t) => renderTab(t.label, t.icon))}
    </nav>
  );
}
