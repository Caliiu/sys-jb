import { isReportDate, REPORT_DAYS_BACK } from '@sysjb/contracts';
import { redirect, unauthorized } from 'next/navigation';
import ReportScreen from '@/components/reports/ReportScreen';
import PlayerShell from '@/components/section/PlayerShell';
import { TenantUnavailable } from '@/components/ui/Notice';
import { formatDateTimeSeconds } from '@/lib/datetime';
import { movementSections } from '@/lib/report-receipts';
import { loadLotteryMovement } from '@/lib/reports';
import { resolveRequest } from '@/lib/request-context';
import { ROUTES } from '@/lib/routes';

export const dynamic = 'force-dynamic';

/** Movimento loterias do dia. Data fora do formato ou do período volta para a escolha do dia. */
export default async function Page({ params }: { params: Promise<{ data: string }> }) {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  const { data: date } = await params;
  const nowIso = new Date().toISOString();
  if (!isReportDate(nowIso, date, REPORT_DAYS_BACK.lotteryMovement)) redirect(ROUTES.lotteryMovement);

  const report = await loadLotteryMovement(ctx.hostname, date);
  if (!report) {
    return (
      <TenantUnavailable hostname={ctx.hostname} message="Não foi possível consultar o movimento. Tente novamente." />
    );
  }

  return (
    <PlayerShell tenant={ctx.tenant} inviteCode={ctx.me.inviteCode} surface="white">
      <ReportScreen
        backHref={ROUTES.lotteryMovement}
        receipt={{
          title: 'Movimento loterias',
          sellerId: ctx.me.displayId,
          consultedAt: formatDateTimeSeconds(nowIso),
          sections: movementSections(report),
        }}
      />
    </PlayerShell>
  );
}
