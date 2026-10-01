import { drawDateOf } from '@sysjb/contracts';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import {
  type WalletMovementKind,
  WALLET_MOVEMENTS,
  parseWalletMovementsQuery,
} from '@/lib/admin/wallet-movements-query';
import WalletMovementsPage from '@/views/admin/WalletMovementsPage';
import AdminMessage from './AdminMessage';
import { AdminUnavailable } from './AdminUnavailable';

/**
 * Página de Depósitos ou Saques: confere a sessão e a permissão (a mesma do menu), lê os filtros da URL e as opções
 * (promotores e o apostador escolhido). Falha nas opções não impede a tela: os filtros seguem sem elas.
 */
export default async function WalletMovementsRoute({
  kind,
  searchParams,
}: {
  kind: WalletMovementKind;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'users.read')) {
    return (
      <AdminMessage title="Sem permissão">{`Seu perfil não pode consultar os ${WALLET_MOVEMENTS[kind].title.toLowerCase()}.`}</AdminMessage>
    );
  }

  const nowIso = new Date().toISOString();
  const query = parseWalletMovementsQuery(kind, await searchParams, nowIso);
  const [promoters, player] = await Promise.all([
    adminApi.listPromoterOptions(session),
    query.userId ? adminApi.getUser(session, query.userId) : null,
  ]);

  return (
    <WalletMovementsPage
      kind={kind}
      query={query}
      today={drawDateOf(nowIso, 0)}
      promoters={promoters.ok ? promoters.data : null}
      player={player?.ok ? { id: player.data.id, displayId: player.data.displayId, name: player.data.name } : null}
    />
  );
}
