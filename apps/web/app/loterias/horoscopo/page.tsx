import { type HoroscopeTodayResponse, type PublicProfile, drawDateOf } from '@sysjb/contracts';
import { unauthorized } from 'next/navigation';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import HoroscopeScreen from '@/components/horoscope/HoroscopeScreen';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { apiRequest } from '@/lib/api-client';
import { brandStyle } from '@/lib/brand-style';
import { signOf } from '@/lib/horoscope';
import { resolveRequest } from '@/lib/request-context';
import { readSessionToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Loterias > Horóscopo. O signo do jogador sai da data de nascimento do perfil, aqui no servidor: só o signo vai para
 * o navegador. Sem o perfil (falha que não é de sessão), a página abre mesmo assim, sem "seu signo". As previsões vêm do
 * cache diário da API (provedor); sem elas, a tela usa a leitura local.
 */
export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  const sessionToken = await readSessionToken();
  if (!sessionToken) unauthorized();
  const [profile, horoscope] = await Promise.all([
    apiRequest<PublicProfile>(ctx.hostname, 'GET', '/v1/me/profile', undefined, { sessionToken }),
    apiRequest<HoroscopeTodayResponse>(ctx.hostname, 'GET', '/v1/horoscope', undefined, { sessionToken }),
  ]);
  if (!profile.ok && profile.error.code === 'SESSION_INVALID') unauthorized();
  const userSign = profile.ok ? signOf(profile.data.birthDate) : null;
  const today = drawDateOf(new Date().toISOString(), 0);
  // Previsão de outro dia (virada da meia-noite entre as duas leituras) não vale para hoje.
  const official = horoscope.ok && horoscope.data.date === today ? horoscope.data.readings : [];

  return (
    <TenantProvider tenant={ctx.tenant}>
      <div style={brandStyle(ctx.tenant)} className="app-shell bg-[#F4F6F6] font-body">
        <InviteProvider inviteCode={ctx.me.inviteCode}>
          <HoroscopeScreen date={today} userSign={userSign} official={official} />
        </InviteProvider>
      </div>
    </TenantProvider>
  );
}
