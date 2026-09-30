import { drawRunsOn, isReportDate, RESULTS_DAYS_BACK } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import ResultsDrawsScreen from '@/components/results/ResultsDrawsScreen';
import PlayerShell from '@/components/section/PlayerShell';
import { TenantUnavailable } from '@/components/ui/Notice';
import { loadDraws } from '@/lib/draws';
import { resolveRequest } from '@/lib/request-context';
import { parseResultDrawIds, ROUTES } from '@/lib/routes';

export const dynamic = 'force-dynamic';

/**
 * Resultado loterias > data: escolha das extrações que correm no dia (Loterias e Fazendinha, que usam os mesmos
 * sorteios). Data fora do formato ou do período volta para a escolha do dia.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ data: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) redirect('/login');

  const { data: date } = await params;
  if (!isReportDate(new Date().toISOString(), date, RESULTS_DAYS_BACK)) redirect(ROUTES.lotteryResults);

  const schedule = await loadDraws(ctx.hostname);
  if (!schedule) {
    return (
      <TenantUnavailable hostname={ctx.hostname} message="Não foi possível carregar as loterias. Tente novamente." />
    );
  }
  const draws = schedule.draws.filter((draw) => drawRunsOn(draw, date, schedule.exceptions));

  return (
    <PlayerShell tenant={ctx.tenant} inviteCode={ctx.me.inviteCode}>
      <ResultsDrawsScreen
        date={date}
        draws={draws}
        initialSelected={parseResultDrawIds((await searchParams).sorteios)}
      />
    </PlayerShell>
  );
}
