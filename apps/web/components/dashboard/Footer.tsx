'use client';

import { Download } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useInstall } from '@/hooks/useInstall';
import { ROUTES } from '@/lib/routes';
import InstallHelpSheet from '../settings/InstallHelpSheet';
import PixIcon from '../icons/PixIcon';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import TenantLogo from '../tenant/TenantLogo';
import { useToast } from '../ui/Toast';
import { useOpenSupport } from '@/hooks/useOpenSupport';

interface FooterLink {
  label: string;
  /** Sem rota, o link avisa que a página vem em breve. */
  to?: string;
}

const LINKS: FooterLink[] = [
  { label: 'Loterias', to: ROUTES.lotteries },
  { label: 'Cassino', to: ROUTES.casino },
  { label: 'Fazendinha', to: ROUTES.fazendinha },
  { label: 'Bingo' },
  { label: 'Raspadinha' },
  { label: 'Resultados', to: ROUTES.results },
  { label: 'Recarga', to: ROUTES.pixTopUp },
  { label: 'Saque', to: ROUTES.withdrawals },
];
const linkClass = 'text-[13px] text-gray-500 hover:text-brand-primary';
const YEAR = new Date().getFullYear();

interface FooterProps {
  /** Versão do app exibida no rodapé (vem do servidor, de package.json). */
  version: string;
}

export default function Footer({ version }: FooterProps) {
  const toast = useToast();
  const openSupport = useOpenSupport();
  const { status, install } = useInstall();
  const [helpOpen, setHelpOpen] = useState(false);
  // Já instalado (ou antes de hidratar, para não piscar): mostra só o Suporte.
  const canInstall = status === 'promptable' || status === 'manual';

  async function handleInstall() {
    if (status === 'promptable' && (await install()) !== 'unavailable') return;
    setHelpOpen(true);
  }

  return (
    <footer className="px-4 pt-6 pb-28 text-center">
      <TenantLogo size={56} className="w-14 h-14 mx-auto" />

      <nav aria-label="Rodapé" className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4 max-w-[340px] mx-auto">
        {LINKS.map(({ label, to }) =>
          to ? (
            <Link key={label} href={to} className={linkClass}>
              {label}
            </Link>
          ) : (
            <button key={label} type="button" onClick={() => toast.comingSoon(label)} className={linkClass}>
              {label}
            </button>
          ),
        )}
      </nav>

      <div className="flex items-center justify-center gap-5 mt-5">
        {canInstall && (
          <button
            type="button"
            onClick={handleInstall}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700"
          >
            <Download className="w-4 h-4" aria-hidden />
            Instalar app
          </button>
        )}
        <button
          type="button"
          onClick={openSupport}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700"
        >
          <WhatsAppIcon className="w-4 h-4" aria-hidden />
          Suporte
        </button>
      </div>
      <InstallHelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />

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

      <p className="text-[11px] text-gray-400 mt-2">
        Jogue com responsabilidade · © {YEAR} · v{version}
      </p>
    </footer>
  );
}
