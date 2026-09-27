'use client';

import type { PublicProfile } from '@sysjb/contracts';
import SectionBar from '../section/SectionBar';
import ProfileForm from './ProfileForm';
import ProfileIdentity from './ProfileIdentity';

/**
 * Perfil do usuário. O formulário reinicia quando os dados salvos mudam (key), assim ele sempre reflete
 * o que está de fato salvo depois de "Salvar alterações".
 */
export default function ProfileScreen({ profile }: { profile: PublicProfile }) {
  return (
    <>
      <SectionBar title="Perfil" />
      <main>
        <h2 className="sr-only">Seus dados</h2>
        <ProfileIdentity name={profile.name} displayId={profile.displayId} />
        <ProfileForm key={`${profile.email ?? ''}|${profile.phone}`} profile={profile} />
      </main>
    </>
  );
}
