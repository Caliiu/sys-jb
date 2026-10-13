import { redirect, unauthorized } from 'next/navigation';
import { Main } from '@/admin/components/layout/main';
import { Alert, AlertDescription, AlertTitle } from '@/admin/components/ui/alert';
import { ForbiddenError } from '@/admin/features/errors/forbidden';
import { Unavailable } from '@/admin/features/errors/unavailable';
import { Units } from '@/admin/features/units';
import type { GiftMilharState } from '@/admin/features/units/components/gift-milhar-card';
import type { UnitDetailState } from '@/admin/features/units/components/unit-settings-sheet';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { parseUnitKey, parseUnitsQuery, unitsApiQuery, unitsHref } from '@/lib/admin/units';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Unidades' };

/**
 * Unidades: a lista de apostadores com as configurações de cada um (consulta com `users.read`; alterar pede
 * `units.manage`) e, no topo, o Milhar Brinde da banca (`quotes.read` consulta, `quotes.manage` altera).
 * ?unidade=<id> abre a gaveta da unidade (carregada aqui, junto com a lista).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) return <Unavailable message={gate.message} />;
  const { session } = gate;
  const forbidden = (
    <Main>
      <ForbiddenError />
    </Main>
  );
  if (!can(session.operator, 'users.read')) return forbidden;

  const raw = await searchParams;
  const query = parseUnitsQuery(raw);
  const unitId = parseUnitKey(raw.unidade);
  const readQuotes = can(session.operator, 'quotes.read');
  const manageQuotes = can(session.operator, 'quotes.manage');

  const [listed, opened, tables, gift] = await Promise.all([
    adminApi.listUsers(session, unitsApiQuery(query)),
    unitId ? adminApi.getUser(session, unitId) : null,
    readQuotes ? adminApi.listQuoteTables(session) : null,
    readQuotes || manageQuotes ? adminApi.getGiftMilharSettings(session) : null,
  ]);

  if (!listed.ok) {
    const failure = toAdminFailure(listed.status, listed.error);
    if (failure.code === 'SESSION_INVALID') unauthorized();
    if (failure.code === 'FORBIDDEN') return forbidden;
    return (
      <Main>
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar as unidades</AlertTitle>
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      </Main>
    );
  }
  // Página além do fim (ex.: a busca mudou): leva à última página existente.
  if (query.page > Math.max(1, listed.data.totalPages)) {
    redirect(unitsHref({ ...query, page: listed.data.totalPages }, unitId));
  }

  let detail: UnitDetailState | null = null;
  if (unitId && opened) {
    if (opened.ok) detail = { id: unitId, status: 'ok', unit: opened.data };
    else if (opened.status === 404) detail = { id: unitId, status: 'not-found' };
    else {
      const failure = toAdminFailure(opened.status, opened.error);
      if (failure.code === 'SESSION_INVALID') unauthorized();
      detail = { id: unitId, status: 'error', message: failure.message };
    }
  }

  let giftMilhar: GiftMilharState | null = null;
  if (gift) {
    if (gift.ok) giftMilhar = { status: 'ok', settings: gift.data };
    else {
      const failure = toAdminFailure(gift.status, gift.error);
      if (failure.code === 'SESSION_INVALID') unauthorized();
      giftMilhar = { status: 'error', message: failure.message };
    }
  }

  return (
    <Units
      query={query}
      result={listed.data}
      detail={detail}
      // Sem a lista (sem permissão ou falha pontual), a escolha fica entre a tabela atual e a padrão.
      quoteTables={tables?.ok ? tables.data : null}
      giftMilhar={giftMilhar}
      permissions={{ manageUnits: can(session.operator, 'units.manage'), manageQuotes }}
    />
  );
}
