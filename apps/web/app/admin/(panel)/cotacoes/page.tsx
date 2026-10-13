import { unauthorized } from 'next/navigation';
import { Main } from '@/admin/components/layout/main';
import { Alert, AlertDescription, AlertTitle } from '@/admin/components/ui/alert';
import { ForbiddenError } from '@/admin/features/errors/forbidden';
import { Unavailable } from '@/admin/features/errors/unavailable';
import { Quotes, type QuoteTableState } from '@/admin/features/quotes';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { parseQuoteTableKey } from '@/lib/admin/quotes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cotações' };

/**
 * Cotações: as tabelas de pagamento da banca e os valores de cada uma (consulta com `quotes.read`; criar, renomear,
 * editar valores, escolher a padrão e excluir pedem `quotes.manage`). ?tabela=<id> abre a tabela; sem ela (ou com uma
 * que não existe), abre a padrão.
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
  if (!can(session.operator, 'quotes.read')) return forbidden;

  const raw = await searchParams;
  const requested = parseQuoteTableKey(raw.tabela);
  // A tabela da URL é buscada junto com a lista; sem ela, a padrão só se conhece depois da lista.
  const [listed, requestedDetail] = await Promise.all([
    adminApi.listQuoteTables(session),
    requested ? adminApi.getQuoteTable(session, requested) : null,
  ]);

  if (!listed.ok) {
    const failure = toAdminFailure(listed.status, listed.error);
    if (failure.code === 'SESSION_INVALID') unauthorized();
    if (failure.code === 'FORBIDDEN') return forbidden;
    return (
      <Main>
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar as cotações</AlertTitle>
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      </Main>
    );
  }

  const tables = listed.data;
  const selectedId =
    (requested && tables.some((table) => table.id === requested) ? requested : null) ??
    tables.find((table) => table.isDefault)?.id ??
    tables[0]?.id ??
    null;
  const hasParam = raw.tabela !== undefined && raw.tabela !== '';

  let detail: QuoteTableState | null = null;
  if (selectedId) {
    const res =
      selectedId === requested && requestedDetail ? requestedDetail : await adminApi.getQuoteTable(session, selectedId);
    if (res.ok) detail = { status: 'ok', table: res.data };
    else if (res.status === 404) detail = { status: 'error', message: 'Tabela de cotação não encontrada.' };
    else {
      const failure = toAdminFailure(res.status, res.error);
      if (failure.code === 'SESSION_INVALID') unauthorized();
      detail = { status: 'error', message: failure.message };
    }
  }

  return (
    <Quotes
      tables={tables}
      selectedId={selectedId}
      detail={detail}
      requestedMissing={hasParam && selectedId !== requested}
      canManage={can(session.operator, 'quotes.manage')}
    />
  );
}
