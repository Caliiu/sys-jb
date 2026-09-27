import type { PublicTenant, PublicUser } from '@sysjb/contracts';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import SettingsScreen from '@/components/settings/SettingsScreen';
import { brandStyle } from '@/lib/brand-style';

interface SettingsPageProps {
  tenant: PublicTenant;
  user: PublicUser;
  /** Versão do app exibida no rodapé da lista. */
  version: string;
}

/** Configurações do usuário. Componente de servidor. */
export default function SettingsPage({ tenant, user, version }: SettingsPageProps) {
  return (
    <div style={brandStyle(tenant)} className="app-shell bg-[#F4F6F6] font-body">
      <InviteProvider inviteCode={String(user.displayId)}>
        <SettingsScreen userId={user.id} version={version} />
      </InviteProvider>
    </div>
  );
}
