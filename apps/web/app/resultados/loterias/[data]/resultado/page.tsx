import { isReportDate, RESULTS_DAYS_BACK, resultOfDraw } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import ResultsScreen from '@/components/results/ResultsScreen';
import PlayerShell from '@/components/section/PlayerShell';
import { TenantUnavailable } from '@/components/ui/Notice';
import { formatDateTimeSeconds } from '@/lib/datetime';
import { loadDraws } from '@/lib/draws';
import { resolveRequest } from '@/lib/request-context';
import { loadResults } from '@/lib/results';
import { type DrawResult, resultsReceipt } from '@/lib/results-receipt';
import { parseResultDrawIds, resultsOfDate, ROUTES } from '@/lib/routes';

export const dynamic = 'force-dynamic';

/**
 * Resultado das extrações escolhidas no dia (`?sorteios=` com os ids), na ordem do cadastro: só as que já têm
 * resultado; nenhuma = "Não há resultado na data". Sem extração escolhida volta para a escolha.
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

  const nowIso = new Date().toISOString();
  const { data: date } = await params;
  if (!isReportDate(nowIso, date, RESULTS_DAYS_BACK)) redirect(ROUTES.lotteryResults);
  const ids = parseResultDrawIds((await searchParams).sorteios);
  if (ids.length === 0) redirect(resultsOfDate(date));

  const [schedule, report] = await Promise.all([loadDraws(ctx.hostname), loadResults(ctx.hostname, date)]);
  if (!schedule || !report) {
    return (
      <TenantUnavailable hostname={ctx.hostname} message="Não foi possível consultar os resultados. Tente novamente." />
    );
  }

  // Sorteio que não existe mais (excluído no painel) fica de fora.
  const results: DrawResult[] = schedule.draws
    .filter((draw) => ids.includes(draw.id))
    .flatMap((draw) => {
      const result = resultOfDraw(report.results, draw.result);
      return result ? [{ drawName: draw.name, prizes: result.prizes }] : [];
    });

  return (
    <PlayerShell tenant={ctx.tenant} inviteCode={ctx.me.inviteCode} surface="white">
      <ResultsScreen
        backHref={resultsOfDate(date, ids)}
        receipt={resultsReceipt({
          date,
          results,
          sellerId: ctx.me.displayId,
          consultedAt: formatDateTimeSeconds(nowIso),
        })}
      />
    </PlayerShell>
  );
}
