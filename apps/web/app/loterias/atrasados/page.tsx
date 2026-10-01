import { redirect } from 'next/navigation';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import OverdueScreen from '@/components/overdue/OverdueScreen';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { brandStyle } from '@/lib/brand-style';
import { loadDraws } from '@/lib/draws';
import { resolveRequest } from '@/lib/request-context';
import { loadOverdue } from '@/lib/results';
import { parseOverdueDrawId, ROUTES } from '@/lib/routes';

export const dynamic = 'force-dynamic';

/**
 * Loterias > Atrasados: o jogador escolhe a loteria (sorteios da banca com resultado ligado) e vê há quantos dias cada
 * bicho não sai na cabeça. O sorteio escolhido fica na URL (`?sorteio=`); id que não é de um sorteio da lista volta
 * para a escolha.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) redirect('/login');

  const raw = (await searchParams).sorteio;
  const drawId = parseOverdueDrawId(raw);
  if (raw !== undefined && !drawId) redirect(ROUTES.overdue);

  const schedule = await loadDraws(ctx.hostname);
  if (!schedule) {
    return (
      <TenantUnavailable hostname={ctx.hostname} message="Não foi possível carregar as loterias. Tente novamente." />
    );
  }
  // Sem resultado ligado não há histórico para contar.
  const draws = schedule.draws.filter((draw) => draw.result !== null);
  if (drawId && !draws.some((draw) => draw.id === drawId)) redirect(ROUTES.overdue);

  const overdue = drawId ? await loadOverdue(ctx.hostname, drawId) : null;

  return (
    <TenantProvider tenant={ctx.tenant}>
      <div style={brandStyle(ctx.tenant)} className="app-shell bg-[#F4F6F6] font-body">
        <InviteProvider inviteCode={ctx.me.inviteCode}>
          <OverdueScreen
            key={drawId ?? 'none'}
            draws={draws}
            selectedId={drawId}
            overdue={overdue}
            failed={drawId !== null && overdue === null}
          />
        </InviteProvider>
      </div>
    </TenantProvider>
  );
}
