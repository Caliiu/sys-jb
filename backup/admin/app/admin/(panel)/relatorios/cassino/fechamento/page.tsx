import { unauthorized } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { parseCasinoClosingMonth } from '@/lib/admin/casino-closing-query';
import CasinoClosingPage from '@/views/admin/CasinoClosingPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fechamento cassino' };

/** Relatórios > Cassino > Fechamento cassino: os cards sempre; o detalhamento do mês escolhido (`?mes=AAAA-MM`). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'operation.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode ver os relatórios.</AdminMessage>;
  }

  const month = parseCasinoClosingMonth(await searchParams, new Date().toISOString());
  const data = await adminApi.casinoClosing(session, month);
  if (!data.ok) {
    const failure = toAdminFailure(data.status, data.error);
    if (failure.code === 'SESSION_INVALID') unauthorized();
    return <AdminMessage title="Não foi possível carregar o fechamento">{failure.message}</AdminMessage>;
  }

  return <CasinoClosingPage data={data.data} canPay={can(session.operator, 'commissions.manage')} />;
}
