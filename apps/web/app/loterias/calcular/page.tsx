import { unauthorized } from 'next/navigation';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import PrizeCalculator from '@/components/lotteries/PrizeCalculator';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { brandStyle } from '@/lib/brand-style';
import { loadQuotes } from '@/lib/quotes';
import { resolveRequest } from '@/lib/request-context';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  // O simulador usa a cotação da banca: sem ela, avisa em vez de mostrar prêmios que podem não valer.
  const quotes = await loadQuotes(ctx.hostname);
  if (!quotes) {
    return (
      <TenantUnavailable hostname={ctx.hostname} message="Não foi possível carregar as cotações. Tente novamente." />
    );
  }

  return (
    <TenantProvider tenant={ctx.tenant}>
      <div style={brandStyle(ctx.tenant)} className="app-shell bg-[#F4F6F6] font-body">
        <InviteProvider inviteCode={ctx.me.inviteCode}>
          <PrizeCalculator quotes={quotes} />
        </InviteProvider>
      </div>
    </TenantProvider>
  );
}
