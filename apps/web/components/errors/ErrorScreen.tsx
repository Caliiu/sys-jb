import type { PublicTenant } from '@sysjb/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import TenantLogo from '@/components/tenant/TenantLogo';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { brandStyle } from '@/lib/brand-style';

export interface ErrorAction {
  label: string;
  href: string;
}

interface ErrorScreenProps {
  tenant: PublicTenant;
  /** "401", "404": em destaque, na cor da banca. */
  code: string;
  title: string;
  children: ReactNode;
  primary: ErrorAction;
  secondary?: ErrorAction;
}

/** Página de erro do app do jogador (401, 404): coluna do app, logo e cor da banca, e o caminho de volta. */
export default function ErrorScreen({ tenant, code, title, children, primary, secondary }: ErrorScreenProps) {
  return (
    <TenantProvider tenant={tenant}>
      <div style={brandStyle(tenant)} className="app-shell flex flex-col bg-slate-50 font-body">
        <header className="flex h-14 items-center justify-center bg-brand-primary">
          <TenantLogo size={36} className="h-9 w-9" />
        </header>
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <p className="font-display text-[64px] leading-none text-brand-primary">{code}</p>
          <h1 className="mt-4 text-[20px] font-bold text-slate-900">{title}</h1>
          <div className="mt-2 max-w-[320px] text-[14.5px] text-slate-600">{children}</div>
          <Link
            href={primary.href}
            className="mt-8 flex h-12 w-full max-w-[320px] items-center justify-center rounded-xl bg-brand-primary text-[15px] font-semibold text-white active:scale-[0.98] transition-transform"
          >
            {primary.label}
          </Link>
          {secondary && (
            <Link href={secondary.href} className="mt-3 text-[14px] font-semibold text-brand-primary">
              {secondary.label}
            </Link>
          )}
        </main>
      </div>
    </TenantProvider>
  );
}
