import { normalizePuleCode } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import PrizeClaimScreen from '@/components/prizes/PrizeClaimScreen';
import PuleCodeForm from '@/components/prizes/PuleCodeForm';
import SectionBar from '@/components/section/SectionBar';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { brandStyle } from '@/lib/brand-style';
import { loadPrizeClaim } from '@/lib/prizes';
import { resolveRequest } from '@/lib/request-context';
import { ROUTES } from '@/lib/routes';

export const dynamic = 'force-dynamic';

/**
 * Premiadas > Reclame. Sem `?pule=`, o campo do código; com ele, o resultado da consulta (código recusado
 * volta ao campo com o aviso, sem consultar a API).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) redirect('/login');

  const raw = (await searchParams).pule;
  const typed = typeof raw === 'string' ? raw : undefined;
  const code = typed === undefined ? null : normalizePuleCode(typed);

  if (code === null) {
    return (
      <TenantProvider tenant={ctx.tenant}>
        <div style={brandStyle(ctx.tenant)} className="app-shell bg-[#F4F6F6] font-body">
          <InviteProvider inviteCode={ctx.me.inviteCode}>
            <SectionBar title="Código da pule" back={{ href: ROUTES.prizes, label: 'Voltar para premiadas' }} />
            <main>
              <PuleCodeForm
                action={ROUTES.prizeClaim}
                defaultValue={typed?.slice(0, 64)}
                error={typed === undefined ? undefined : 'Informe o código da pule (só números).'}
              />
            </main>
          </InviteProvider>
        </div>
      </TenantProvider>
    );
  }

  const claim = await loadPrizeClaim(ctx.hostname, code);
  if (!claim) {
    return <TenantUnavailable hostname={ctx.hostname} message="Não foi possível consultar a pule. Tente novamente." />;
  }

  return (
    <TenantProvider tenant={ctx.tenant}>
      <div style={brandStyle(ctx.tenant)} className="app-shell flex flex-col bg-white font-body">
        <InviteProvider inviteCode={ctx.me.inviteCode}>
          <PrizeClaimScreen claim={claim} sellerId={ctx.me.displayId} nowIso={new Date().toISOString()} />
        </InviteProvider>
      </div>
    </TenantProvider>
  );
}
