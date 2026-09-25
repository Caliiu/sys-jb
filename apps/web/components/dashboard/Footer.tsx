'use client';

import { Download } from 'lucide-react';
import PixIcon from '../icons/PixIcon';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import TenantLogo from '../tenant/TenantLogo';
import { useToast } from '../ui/Toast';

const LINKS = ['Loterias', 'Cassino', 'Fazendinha', 'Bingo', 'Raspadinha', 'Resultados', 'Recarga', 'Saque'];
const YEAR = new Date().getFullYear();

export default function Footer() {
  const toast = useToast();

  return (
    <footer className="px-4 pt-6 pb-28 text-center">
      <TenantLogo size={56} className="w-14 h-14 mx-auto" />

      <nav aria-label="Rodapé" className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4 max-w-[340px] mx-auto">
        {LINKS.map((link) => (
          <button
            key={link}
            type="button"
            onClick={() => toast.comingSoon(link)}
            className="text-[13px] text-gray-500 hover:text-brand-primary"
          >
            {link}
          </button>
        ))}
      </nav>

      <div className="flex items-center justify-center gap-5 mt-5">
        <button
          type="button"
          onClick={() => toast.comingSoon('Aplicativo')}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700"
        >
          <Download className="w-4 h-4" aria-hidden />
          Instalar app
        </button>
        <button
          type="button"
          onClick={() => toast.comingSoon('Atendimento')}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700"
        >
          <WhatsAppIcon className="w-4 h-4" aria-hidden />
          Suporte
        </button>
      </div>

      <div className="flex items-center justify-center gap-3 mt-5 pt-4 border-t border-gray-200">
        <span
          aria-label="Proibido para menores de 18 anos"
          className="flex items-center justify-center w-6 h-6 text-[10.5px] font-semibold text-gray-500 border border-gray-300 rounded-full"
        >
          18+
        </span>
        <span className="text-[11.5px] text-gray-500">BeGambleAware.org</span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
          <PixIcon size={14} aria-hidden />
          Pix
        </span>
      </div>

      <p className="text-[11px] text-gray-400 mt-2">Jogue com responsabilidade · © {YEAR} · v0.0.1</p>
    </footer>
  );
}
