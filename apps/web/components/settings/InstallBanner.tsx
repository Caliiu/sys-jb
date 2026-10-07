'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { useInstall } from '@/hooks/useInstall';
import TenantLogo from '../tenant/TenantLogo';
import InstallHelpSheet from './InstallHelpSheet';

/**
 * "Baixar aplicativo": instala o app na tela inicial. Com o pedido do navegador disponível, um toque
 * abre a instalação; sem ele, mostra o passo a passo. Já instalado (ou antes de hidratar), não aparece.
 */
export default function InstallBanner() {
  const { status, install } = useInstall();
  const [helpOpen, setHelpOpen] = useState(false);

  if (status === 'unknown' || status === 'installed') return null;

  async function handleClick() {
    if (status === 'promptable' && (await install()) !== 'unavailable') return;
    setHelpOpen(true);
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={handleClick}
          className="flex w-full items-center gap-3 rounded-xl bg-brand-primary px-4 py-3 text-left text-white shadow-lg transition-transform active:scale-[0.99]"
        >
          <TenantLogo size={40} decorative className="h-10 w-10 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold leading-tight">Baixar aplicativo</span>
            <span className="block text-[13px] leading-tight text-white/85">Adicionar à tela inicial</span>
          </span>
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <Download className="h-5 w-5" />
          </span>
        </button>
      </div>
      <InstallHelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
