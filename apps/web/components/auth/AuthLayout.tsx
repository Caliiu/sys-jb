'use client';

import type { ReactNode } from 'react';
import { MessageCircle } from 'lucide-react';
import { brandStyle } from '@/lib/brand-style';
import TenantLogo from '../tenant/TenantLogo';
import { useTenant } from '../tenant/TenantProvider';
import { useToast } from '../ui/Toast';

/**
 * Moldura das telas de cadastro e login (visual do app original). White label: logo e cor
 * primária vêm da banca atual.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const tenant = useTenant();
  const toast = useToast();

  return (
    <div style={brandStyle(tenant)} className="app-shell bg-brand-primary flex flex-col font-body">
      <main className="flex-1 flex flex-col justify-center px-5">
        {tenant.logoUrl ? (
          <TenantLogo size={96} className="w-24 h-auto mx-auto shrink-0" />
        ) : (
          <span className="mx-auto shrink-0 text-center font-display text-[22px] leading-tight text-white">
            {tenant.name}
          </span>
        )}

        <div className="mt-6">{children}</div>
      </main>

      <div className="px-5 pb-8 pt-6 flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => toast.comingSoon('Central de dúvidas')}
          className="text-white text-[13px] font-semibold"
        >
          Dúvidas?
        </button>
        <button
          type="button"
          onClick={() => toast.comingSoon('Atendimento')}
          className="flex items-center gap-1.5 text-white text-[14px] font-bold"
        >
          <MessageCircle className="w-4 h-4" aria-hidden />
          Fale com o suporte
        </button>
      </div>
    </div>
  );
}
