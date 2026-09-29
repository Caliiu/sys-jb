import { isReportDate, normalizePuleCode, REPORT_DAYS_BACK } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import PuleReceiptScreen from '@/components/reports/PuleReceiptScreen';
import PlayerShell from '@/components/section/PlayerShell';
import { TenantUnavailable } from '@/components/ui/Notice';
import { loadPule } from '@/lib/reports';
import { resolveRequest } from '@/lib/request-context';
import { pulesOfDate, ROUTES } from '@/lib/routes';

export const dynamic = 'force-dynamic';

/**
 * Recibo de uma pule aberto pela lista do dia (`?lista=YYYY-MM-DD`: o voltar leva de volta a ela). Número
 * inválido ou pule que não é do jogador cai na consulta por código, que mostra o aviso.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ numero: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) redirect('/login');

  const code = normalizePuleCode((await params).numero);
  if (code === null) redirect(ROUTES.puleByCode);

  const detail = await loadPule(ctx.hostname, code);
  if (detail === 'not_found') redirect(`${ROUTES.puleByCode}?pule=${code}`);
  if (!detail) {
    return <TenantUnavailable hostname={ctx.hostname} message="Não foi possível consultar a pule. Tente novamente." />;
  }

  // Só volta para uma lista de dia válida (nunca para um endereço vindo da URL).
  const list = (await searchParams).lista;
  const back =
    typeof list === 'string' && isReportDate(new Date().toISOString(), list, REPORT_DAYS_BACK.pules)
      ? { href: pulesOfDate(list), label: 'Voltar para as pules' }
      : { href: ROUTES.puleLookup, label: 'Voltar para consultar pule' };

  return (
    <PlayerShell tenant={ctx.tenant} inviteCode={ctx.me.inviteCode}>
      <PuleReceiptScreen detail={detail} back={back} />
    </PlayerShell>
  );
}
