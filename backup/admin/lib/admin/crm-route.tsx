import 'server-only';
import type { CrmList } from '@sysjb/contracts';
import { redirect, unauthorized } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import CrmPage from '@/views/admin/CrmPage';
import { adminApi } from './admin-api';
import { can, requireAdmin } from './admin-context';
import { toAdminFailure } from './admin-result';
import { crmHref, parseCrmQuery } from './crm-query';

/**
 * Página de uma lista do CRM: confere a sessão e a permissão (a mesma do menu), lê os filtros da URL e as opções de
 * promotor. Falha nas opções não impede a tela: o filtro de promotor fica só com "Todos".
 */
export async function CrmRoute({
  list,
  searchParams,
}: {
  list: CrmList;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'users.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar os apostadores.</AdminMessage>;
  }

  const query = parseCrmQuery(list, await searchParams);
  const [promoters, data] = await Promise.all([
    adminApi.listPromoterOptions(session),
    adminApi.crmList(session, query),
  ]);
  if (!data.ok) {
    const failure = toAdminFailure(data.status, data.error);
    if (failure.code === 'SESSION_INVALID') unauthorized();
    // Promotor que deixou de ser promotor (link antigo): volta para todos.
    if (data.status === 404 && query.promoterId) redirect(crmHref({ ...query, promoterId: '', page: 1 }));
    return <AdminMessage title="Não foi possível carregar a lista">{failure.message}</AdminMessage>;
  }
  // Página além do fim (ex.: filtro mudou): volta ao início da lista.
  if (query.page > 1 && data.data.items.length === 0) redirect(crmHref({ ...query, page: 1 }));

  return <CrmPage query={query} promoters={promoters.ok ? promoters.data : null} data={data.data} />;
}
