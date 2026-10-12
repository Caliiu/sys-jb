import { unauthorized } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import OperatorsManager from '@/components/admin/OperatorsManager';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Operadores' };

/** Administração > Operadores: só o Gerente (a API confere de novo a cada chamada). */
export default async function Page() {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'operators.manage')) {
    return <AdminMessage title="Sem permissão">Só o Gerente cadastra e altera operadores.</AdminMessage>;
  }

  const res = await adminApi.listOperators(session);
  if (!res.ok) {
    const failure = toAdminFailure(res.status, res.error);
    if (failure.code === 'SESSION_INVALID') unauthorized();
    return <AdminMessage title="Não foi possível carregar os operadores">{failure.message}</AdminMessage>;
  }

  return (
    <div>
      <h1 className="mb-4 text-[18px] font-bold text-admin-text">Operadores</h1>
      <OperatorsManager initial={res.data} />
    </div>
  );
}
