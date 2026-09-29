'use client';

import type { PublicTenant } from '@sysjb/contracts';
import { ImageIcon } from 'lucide-react';
import { brandStyle } from '@/lib/brand-style';
import TenantLogo from '../tenant/TenantLogo';

interface MuralPreviewProps {
  tenant: Pick<PublicTenant, 'name' | 'primaryColor' | 'secondaryColor' | 'inviteBarText' | 'inviteBarEnabled'>;
  /** URL da imagem (arquivo escolhido ou a imagem salva); null = ainda sem imagem. */
  imageUrl: string | null;
  name: string;
}

/**
 * Como o jogador vê o mural: o Dashboard escurecido ao fundo e a folha inferior com a imagem e "Fechar"
 * (mesmo visual de components/dashboard/MuralSheet). Só ilustração: nada aqui é clicável.
 */
export default function MuralPreview({ tenant, imageUrl, name }: MuralPreviewProps) {
  return (
    <figure className="mx-auto w-full max-w-[280px]">
      <div
        style={brandStyle(tenant)}
        aria-hidden
        className="relative flex aspect-[9/19] flex-col overflow-hidden rounded-[28px] border-[6px] border-admin-text bg-[#EDEDED] font-body shadow-admin"
      >
        {/* Dashboard ao fundo */}
        {tenant.inviteBarEnabled && (
          <div className="flex h-5 items-center justify-center bg-brand-orange text-[7px] font-semibold text-white">
            {tenant.inviteBarText}
          </div>
        )}
        <div className="flex h-9 items-center gap-2 bg-brand-primary px-3">
          <TenantLogo size={20} className="h-5 w-5" decorative />
          <span className="flex-1 text-center font-display text-[9px] text-white">UNIDADE: 100000</span>
        </div>
        <div className="space-y-1.5 bg-white p-3">
          <div className="h-2 w-10 rounded bg-gray-200" />
          <div className="h-3 w-24 rounded bg-gray-200" />
          <div className="h-2 w-16 rounded bg-gray-200" />
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          <div className="h-14 rounded-lg bg-brand-primary/70" />
          <div className="h-14 rounded-lg bg-brand-primary/70" />
        </div>

        {/* Folha do mural */}
        <div className="absolute inset-0 flex items-end bg-black/50">
          <div className="w-full rounded-t-2xl bg-white px-3 pb-3">
            <div className="flex justify-center pt-2 pb-2.5">
              <span className="block h-1 w-8 rounded-full bg-gray-300" />
            </div>
            {imageUrl ? (
              // Pré-visualização de arquivo local (blob:) ou da imagem salva: <img> simples.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="max-h-[330px] w-full rounded-lg object-contain" />
            ) : (
              <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-[10px] text-gray-400">
                <ImageIcon className="h-6 w-6" />
                Sua imagem aqui
              </div>
            )}
            <div className="mt-3 flex h-8 items-center justify-center rounded-lg bg-brand-orange text-[11px] font-bold text-white">
              Fechar
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-[12px] text-admin-muted">
        {name.trim() ? `Pré-visualização: ${name.trim()}` : 'Pré-visualização'}
      </figcaption>
    </figure>
  );
}
