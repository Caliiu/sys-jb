'use client';

import { Menu } from 'lucide-react';
import { brandStyle } from '@/lib/brand-style';
import { tenantInitial } from '@/lib/favicon';

interface BrandingPreviewProps {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  inviteBarText: string;
  inviteBarEnabled: boolean;
  /** Logo escolhida (blob:), a salva ou a padrão; null = só a inicial do nome. */
  logoUrl: string | null;
}

function Logo({ url, name, size }: { url: string | null; name: string; size: number }) {
  if (url) {
    // Pré-visualização de arquivo local (blob:) ou da logo salva: <img> simples.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 object-contain" />;
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-white font-display text-brand-primary"
    >
      {tenantInitial(name || '?')}
    </span>
  );
}

/**
 * Como o jogador vê a banca com a identidade do formulário: aba do navegador, tela de login e o topo do início.
 * Só ilustração: nada aqui é clicável.
 */
export default function BrandingPreview({
  name,
  primaryColor,
  secondaryColor,
  inviteBarText,
  inviteBarEnabled,
  logoUrl,
}: BrandingPreviewProps) {
  const displayName = name.trim() || 'Nome da banca';
  return (
    <figure style={brandStyle({ primaryColor, secondaryColor })} aria-hidden className="flex flex-col gap-4">
      {/* Aba do navegador */}
      <div className="flex max-w-[260px] items-center gap-2 rounded-t-lg border border-b-0 border-admin-border bg-admin-surface px-3 py-2">
        <Logo url={logoUrl} name={displayName} size={16} />
        <span className="truncate text-[12px] text-admin-text">{displayName}</span>
      </div>

      <div className="flex flex-wrap gap-4">
        {/* Login */}
        <div className="flex h-[300px] w-[150px] flex-col items-center justify-center gap-3 overflow-hidden rounded-[20px] border-[5px] border-admin-text bg-brand-primary px-3 font-body">
          {logoUrl ? (
            <Logo url={logoUrl} name={displayName} size={56} />
          ) : (
            <span className="text-center font-display text-[13px] leading-tight text-white">{displayName}</span>
          )}
          <div className="h-6 w-full rounded bg-white/90" />
          <div className="h-6 w-full rounded bg-white/90" />
          <div className="h-6 w-full rounded bg-brand-orange" />
        </div>

        {/* Topo do início */}
        <div className="flex h-[300px] w-[150px] flex-col overflow-hidden rounded-[20px] border-[5px] border-admin-text bg-[#EDEDED] font-body">
          {inviteBarEnabled && (
            <div className="flex min-h-5 items-center justify-center gap-1.5 bg-brand-orange px-1.5 py-1">
              <span className="text-center text-[7px] leading-tight font-semibold text-white">{inviteBarText}</span>
              <span className="shrink-0 rounded-sm bg-white px-1.5 text-[6.5px] font-bold text-brand-primary">
                Indicar
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 bg-brand-primary px-2 py-2">
            <Logo url={logoUrl} name={displayName} size={18} />
            <span className="flex-1 truncate text-[7.5px] font-semibold text-white">Olá, Jogador</span>
            <Menu className="h-3 w-3 text-white" />
          </div>
          <div className="space-y-1 bg-white p-2">
            <div className="h-1.5 w-8 rounded bg-gray-200" />
            <div className="h-2.5 w-16 rounded bg-gray-300" />
            <div className="mt-2 rounded border border-brand-primary px-1.5 py-1 text-[6.5px] font-semibold text-brand-primary">
              Ganhe convidando seus amigos
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-2">
            <div className="h-12 rounded bg-brand-primary" />
            <div className="h-12 rounded bg-brand-primary" />
            <div className="h-8 rounded bg-brand-primary" />
            <div className="h-8 rounded bg-brand-primary" />
          </div>
        </div>
      </div>
      <figcaption className="text-[12px] text-admin-muted">
        Pré-visualização: aba do navegador, login e início.
      </figcaption>
    </figure>
  );
}
