import type { PublicProfile, PublicTenant } from '@sysjb/contracts';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import ProfileScreen from '@/components/profile/ProfileScreen';
import { brandStyle } from '@/lib/brand-style';

interface ProfilePageProps {
  tenant: PublicTenant;
  profile: PublicProfile;
}

/** Perfil do usuário logado. Componente de servidor. */
export default function ProfilePage({ tenant, profile }: ProfilePageProps) {
  return (
    <div style={brandStyle(tenant)} className="app-shell bg-[#F4F6F6] font-body">
      <InviteProvider inviteCode={String(profile.displayId)}>
        <ProfileScreen profile={profile} />
      </InviteProvider>
    </div>
  );
}
