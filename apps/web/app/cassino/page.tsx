import { unauthorized } from 'next/navigation';
import CasinoLobby from '@/components/casino/CasinoLobby';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { TenantUnavailable } from '@/components/ui/Notice';
import { brandStyle } from '@/lib/brand-style';
import { loadCasinoLobby } from '@/lib/casino';
import { resolveRequest } from '@/lib/request-context';

export const dynamic = 'force-dynamic';

/** Cassino: lobby com o saldo do cassino (Disponível Games). */
export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  const lobby = await loadCasinoLobby(ctx.hostname);
  return (
    <TenantProvider tenant={ctx.tenant}>
      <div style={brandStyle(ctx.tenant)} className="app-shell font-body bg-[#14151c]">
        <CasinoLobby lobby={lobby} balanceCents={ctx.me.wallet.totalAvailableGames} userId={ctx.me.id} />
      </div>
    </TenantProvider>
  );
}
