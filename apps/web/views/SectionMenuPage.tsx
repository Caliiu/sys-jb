import type { PublicTenant, PublicUser } from '@sysjb/contracts';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import MenuList from '@/components/section/MenuList';
import SectionBar from '@/components/section/SectionBar';
import type { BackAction } from '@/components/ui/BackButton';
import { brandStyle } from '@/lib/brand-style';
import type { SectionMenu } from '@/lib/section-menus';

interface SectionMenuPageProps {
  tenant: PublicTenant;
  user: PublicUser;
  menu: SectionMenu;
  /** Padrão: volta ao início. */
  back?: BackAction;
}

/** Tela interna com uma lista de atalhos (Resultados, Relatórios, Premiadas, datas). Componente de servidor. */
export default function SectionMenuPage({ tenant, user, menu, back }: SectionMenuPageProps) {
  return (
    <div style={brandStyle(tenant)} className="app-shell bg-[#F4F6F6] font-body">
      <InviteProvider inviteCode={user.inviteCode}>
        <SectionBar title={menu.title} back={back} />
        <main>
          <MenuList items={menu.items} label={menu.title} />
        </main>
      </InviteProvider>
    </div>
  );
}
