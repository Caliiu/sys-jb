import type { PublicTenant, PublicUser } from '@sysjb/contracts';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import MenuList from '@/components/section/MenuList';
import SectionBar from '@/components/section/SectionBar';
import { brandStyle } from '@/lib/brand-style';
import type { SectionMenu } from '@/lib/section-menus';

interface SectionMenuPageProps {
  tenant: PublicTenant;
  user: PublicUser;
  menu: SectionMenu;
}

/** Tela interna com uma lista de atalhos (Resultados, Relatórios, Premiadas). Componente de servidor. */
export default function SectionMenuPage({ tenant, user, menu }: SectionMenuPageProps) {
  return (
    <div style={brandStyle(tenant)} className="app-shell bg-[#F4F6F6] font-body">
      <InviteProvider inviteCode={String(user.displayId)}>
        <SectionBar title={menu.title} />
        <main>
          <MenuList items={menu.items} label={menu.title} />
        </main>
      </InviteProvider>
    </div>
  );
}
