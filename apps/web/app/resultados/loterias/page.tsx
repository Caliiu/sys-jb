import { isReportDate, RESULTS_DAYS_BACK } from '@sysjb/contracts';
import { unauthorized } from 'next/navigation';
import ResultsFlow, { type ResultsStep } from '@/components/results/ResultsFlow';
import PlayerShell from '@/components/section/PlayerShell';
import { TenantUnavailable } from '@/components/ui/Notice';
import { loadDraws } from '@/lib/draws';
import { resolveRequest } from '@/lib/request-context';
import { loadResults } from '@/lib/results';
import { parseResultDrawIds } from '@/lib/routes';

export const dynamic = 'force-dynamic';

/**
 * Resultados > Resultado loterias, numa rota só: dia (hoje e os 7 anteriores, em Brasília) → extrações do dia →
 * resultado, trocando de etapa na tela. O link da notificação "Resultado saiu" (`?data=&sorteios=`) abre direto no
 * resultado; data fora do período é ignorada (abre na escolha do dia).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  const schedule = await loadDraws(ctx.hostname);
  if (!schedule) {
    return (
      <TenantUnavailable hostname={ctx.hostname} message="Não foi possível carregar as loterias. Tente novamente." />
    );
  }

  const nowIso = new Date().toISOString();
  const query = await searchParams;
  const rawDate = Array.isArray(query.data) ? query.data[0] : query.data;
  const date = rawDate && isReportDate(nowIso, rawDate, RESULTS_DAYS_BACK) ? rawDate : null;
  const selected = date ? parseResultDrawIds(query.sorteios) : [];

  let start: ResultsStep = { step: 'dates' };
  if (date && selected.length > 0) {
    // Sem a consulta (API fora do ar), abre nas extrações do dia, já marcadas: "Avançar" tenta de novo.
    const report = await loadResults(ctx.hostname, date);
    start = report
      ? { step: 'result', date, selected, loaded: { report, consultedAt: nowIso } }
      : { step: 'draws', date, selected };
  } else if (date) {
    start = { step: 'draws', date, selected: [] };
  }

  return (
    <PlayerShell tenant={ctx.tenant} inviteCode={ctx.me.inviteCode}>
      <ResultsFlow nowIso={nowIso} schedule={schedule} sellerId={ctx.me.displayId} start={start} />
    </PlayerShell>
  );
}
