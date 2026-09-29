import type { PublicTenant } from '@sysjb/contracts';
import type { ReactNode } from 'react';
import { brandStyle } from '@/lib/brand-style';
import { InviteProvider } from '../dashboard/InviteProvider';
import { TenantProvider } from '../tenant/TenantProvider';

interface PlayerShellProps {
  tenant: PublicTenant;
  inviteCode: string;
  /** gray: listas e formulários; white: comprovantes (fundo branco até o rodapé). */
  surface?: 'gray' | 'white';
  children: ReactNode;
}

/** Moldura das telas internas do jogador: banca, cores da marca e o convite da barra superior. */
export default function PlayerShell({ tenant, inviteCode, surface = 'gray', children }: PlayerShellProps) {
  return (
    <TenantProvider tenant={tenant}>
      <div
        style={brandStyle(tenant)}
        className={`app-shell flex flex-col font-body ${surface === 'white' ? 'bg-white' : 'bg-[#F4F6F6]'}`}
      >
        <InviteProvider inviteCode={inviteCode}>{children}</InviteProvider>
      </div>
    </TenantProvider>
  );
}
