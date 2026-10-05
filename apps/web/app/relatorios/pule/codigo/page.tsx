import { normalizePuleCode } from '@sysjb/contracts';
import { unauthorized } from 'next/navigation';
import PuleCodeForm from '@/components/prizes/PuleCodeForm';
import PuleReceiptScreen from '@/components/reports/PuleReceiptScreen';
import PlayerShell from '@/components/section/PlayerShell';
import SectionBar from '@/components/section/SectionBar';
import { TenantUnavailable } from '@/components/ui/Notice';
import { loadPule } from '@/lib/reports';
import { resolveRequest } from '@/lib/request-context';
import { ROUTES } from '@/lib/routes';

export const dynamic = 'force-dynamic';

/**
 * Consultar pule por código. Sem `?pule=`, o campo; com ele, o recibo. Código recusado volta ao campo com o
 * aviso sem consultar a API; pule que não é do jogador (ou não existe) volta com "Pule não encontrada.".
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  const raw = (await searchParams).pule;
  const typed = typeof raw === 'string' ? raw : undefined;
  const code = typed === undefined ? null : normalizePuleCode(typed);
  const detail = code === null ? null : await loadPule(ctx.hostname, code);

  if (code !== null && detail === null) {
    return <TenantUnavailable hostname={ctx.hostname} message="Não foi possível consultar a pule. Tente novamente." />;
  }

  if (detail && detail !== 'not_found') {
    return (
      <PlayerShell tenant={ctx.tenant} inviteCode={ctx.me.inviteCode}>
        <PuleReceiptScreen detail={detail} back={{ href: ROUTES.puleByCode, label: 'Consultar outra pule' }} />
      </PlayerShell>
    );
  }

  const error =
    typed === undefined
      ? undefined
      : detail === 'not_found'
        ? 'Pule não encontrada.'
        : 'Informe o código da pule (só números).';

  return (
    <PlayerShell tenant={ctx.tenant} inviteCode={ctx.me.inviteCode}>
      <SectionBar title="Código da pule" back={{ href: ROUTES.puleLookup, label: 'Voltar para consultar pule' }} />
      <main>
        <PuleCodeForm action={ROUTES.puleByCode} defaultValue={typed?.slice(0, 64)} error={error} />
      </main>
    </PlayerShell>
  );
}
