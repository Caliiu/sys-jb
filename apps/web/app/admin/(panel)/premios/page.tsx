import { drawDateOf } from '@sysjb/contracts';
import { redirect, unauthorized } from 'next/navigation';
import { Main } from '@/admin/components/layout/main';
import { Alert, AlertDescription, AlertTitle } from '@/admin/components/ui/alert';
import { ForbiddenError } from '@/admin/features/errors/forbidden';
import { Unavailable } from '@/admin/features/errors/unavailable';
import { Prizes } from '@/admin/features/prizes';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { parsePrizesQuery, prizesHref } from '@/lib/admin/prizes-query';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pules Premiadas' };

/** Prêmios > Pules Premiadas: filtros na URL; sem período na URL, mostra o dia de hoje. */
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
  if (!can(session.operator, 'tickets.read')) return forbidden;

  const nowIso = new Date().toISOString();
  const query = parsePrizesQuery(await searchParams, nowIso);
  const [promoters, listed] = await Promise.all([
    adminApi.listPromoterOptions(session),
    adminApi.listPrizes(session, query),
  ]);

  if (!listed.ok) {
    const failure = toAdminFailure(listed.status, listed.error);
    if (failure.code === 'SESSION_INVALID') unauthorized();
    if (failure.code === 'FORBIDDEN') return forbidden;
    return (
      <Main>
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar as pules premiadas</AlertTitle>
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      </Main>
    );
  }
  // Página além do fim (ex.: o filtro mudou): leva à última página existente.
  if (query.page > Math.max(1, listed.data.totalPages)) {
    redirect(prizesHref({ ...query, page: listed.data.totalPages }));
  }

  return (
    <Prizes
      query={query}
      nowIso={nowIso}
      today={drawDateOf(nowIso, 0)}
      // Sem as opções (falha pontual), o filtro de promotor fica só com "todos".
      promoters={promoters.ok ? promoters.data : null}
      result={listed.data}
    />
  );
}
