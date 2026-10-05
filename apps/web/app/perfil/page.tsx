import type { PublicProfile } from '@sysjb/contracts';
import { unauthorized } from 'next/navigation';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import Notice, { TenantUnavailable } from '@/components/ui/Notice';
import { apiRequest } from '@/lib/api-client';
import { resolveRequest } from '@/lib/request-context';
import { readSessionToken } from '@/lib/session';
import ProfilePage from '@/views/ProfilePage';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  // A data de nascimento não faz parte do contrato público: vem do perfil do próprio usuário.
  const sessionToken = await readSessionToken();
  const profile = sessionToken
    ? await apiRequest<PublicProfile>(ctx.hostname, 'GET', '/v1/me/profile', undefined, { sessionToken })
    : null;
  if (!profile) unauthorized();
  if (!profile.ok) {
    if (profile.error.code === 'SESSION_INVALID') unauthorized();
    return (
      <Notice title="Não foi possível carregar o perfil">
        <p>Tente novamente em instantes.</p>
      </Notice>
    );
  }

  return (
    <TenantProvider tenant={ctx.tenant}>
      <ProfilePage tenant={ctx.tenant} profile={profile.data} />
    </TenantProvider>
  );
}
