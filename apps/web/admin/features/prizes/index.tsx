'use client';

import type { AdminPrizeList, AdminPromoterOption } from '@sysjb/contracts';
import { Main } from '@/admin/components/layout/main';
import { UrlPagination } from '@/admin/components/url-pagination';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { type PrizesQuery, prizesHref } from '@/lib/admin/prizes-query';
import { PrizesFilters } from './components/prizes-filters';
import { PrizesSummary } from './components/prizes-summary';
import { PrizesTable } from './components/prizes-table';

/** Opções de linhas por página desta lista. */
const PRIZES_PAGE_SIZES = [25, 50, 100];

export type PrizesProps = {
  query: PrizesQuery;
  /** Agora (ISO) e hoje (YYYY-MM-DD, Brasília), do servidor. */
  nowIso: string;
  today: string;
  promoters: AdminPromoterOption[] | null;
  result: AdminPrizeList;
};

/** Link do PDF: os mesmos filtros da lista, sem a paginação (o PDF leva todas as páginas). */
export function prizesPdfHref(query: PrizesQuery): string {
  const params = new URL(prizesHref({ ...query, page: 1 }), 'http://x').searchParams;
  params.delete('pageSize');
  return `${ADMIN_ROUTES.prizesPdf}?${params}`;
}

/** Prêmios > Pules Premiadas: apostas premiadas no período pela data do jogo, pagas ou aguardando apuração. */
export function Prizes({ query, nowIso, today, promoters, result }: PrizesProps) {
  return (
    <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pules Premiadas</h1>
        <p className="text-muted-foreground">
          Apostas premiadas pela data do jogo, das maiores para as menores: pagas e aguardando apuração.
        </p>
      </div>
      {/* key: Limpar e voltar/avançar trocam a URL; os campos acompanham. */}
      <PrizesFilters key={prizesHref(query)} query={query} nowIso={nowIso} today={today} promoters={promoters} />
      <PrizesSummary query={query} result={result} />
      <PrizesTable
        key={`${result.page}:${prizesHref(query)}`}
        items={result.items}
        pdfHref={prizesPdfHref(query)}
        status={query.status}
      />
      <UrlPagination
        page={result.page}
        totalPages={result.totalPages}
        pageSize={query.pageSize}
        sizes={PRIZES_PAGE_SIZES}
        hrefFor={(page, pageSize = query.pageSize) => prizesHref({ ...query, page, pageSize })}
      />
    </Main>
  );
}
