'use client';

import { ArrowRight } from 'lucide-react';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import { useToast } from '../ui/Toast';

export default function SupportBanner() {
  const toast = useToast();

  return (
    <button
      type="button"
      onClick={() => toast.comingSoon('Atendimento')}
      className="w-[calc(100%-2rem)] mx-4 mt-1 flex items-center justify-between bg-gradient-to-r from-brand-teal to-brand-tealDark rounded-xl2 px-4 py-3 shadow-card active:scale-[0.98] transition-transform"
    >
      <span className="flex items-center gap-3">
        <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
          <WhatsAppIcon className="w-4 h-4 text-white" aria-hidden />
        </span>
        <span className="text-left leading-tight">
          <span className="block text-white font-bold text-[13px]">Atendimento</span>
          <span className="block text-white/80 text-[11.5px]">Fale com o suporte</span>
        </span>
      </span>
      <span className="flex items-center gap-1 text-white text-[13px] font-semibold">
        Conversar <ArrowRight className="w-4 h-4" aria-hidden />
      </span>
    </button>
  );
}
