import { redirect } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { fazendinhaSoldAction } from '@/app/fazendinha-actions';
import { loadDraws } from '@/lib/draws';
import { drawDateOf, toSoldMap } from '@/lib/fazendinha';
import { loadQuotes } from '@/lib/quotes';
import { resolveRequest } from '@/lib/request-context';
import FazendinhaPage from '@/views/FazendinhaPage';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) redirect('/login');

  const nowIso = new Date().toISOString();
  // Falha na consulta: a página abre sem marcar vendidos (a API recusa número vendido na compra).
  const [sold, quotes, schedule] = await Promise.all([
    fazendinhaSoldAction(drawDateOf(nowIso, 0)),
    loadQuotes(ctx.hostname),
    loadDraws(ctx.hostname),
  ]);
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
      <FazendinhaPage
        tenant={ctx.tenant}
        user={ctx.me}
        nowIso={nowIso}
        initialSold={toSoldMap(sold ?? [])}
        quotes={quotes.fazendinha}
        schedule={schedule}
      />
    </TenantProvider>
  );
}
