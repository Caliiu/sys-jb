import { unauthorized } from 'next/navigation';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import LotteriesScreen from '@/components/lotteries/LotteriesScreen';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { brandStyle } from '@/lib/brand-style';
import { loadDraws } from '@/lib/draws';
import { loadQuotes } from '@/lib/quotes';
import { resolveRequest } from '@/lib/request-context';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  // Sem cotações ou sorteios não dá para mostrar prêmios e horários confiáveis: avisa em vez de abrir a tela.
  const [quotes, schedule] = await Promise.all([loadQuotes(ctx.hostname), loadDraws(ctx.hostname)]);
  if (!quotes || !schedule) {
    return (
      <TenantUnavailable
        hostname={ctx.hostname}
        message={`Não foi possível carregar ${quotes ? 'os sorteios' : 'as cotações'}. Tente novamente.`}
      />
    );
  }

  return (
    <TenantProvider tenant={ctx.tenant}>
      <div style={brandStyle(ctx.tenant)} className="app-shell bg-[#F4F6F6] font-body">
        <InviteProvider inviteCode={ctx.me.inviteCode}>
          <LotteriesScreen
            nowIso={new Date().toISOString()}
            wallet={ctx.me.wallet}
            quotes={quotes}
            schedule={schedule}
            sellerId={ctx.me.displayId}
            userName={ctx.me.name}
          />
        </InviteProvider>
      </div>
    </TenantProvider>
  );
}
