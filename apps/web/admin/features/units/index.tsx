'use client';

import type { AdminQuoteTableSummary, AdminUserListItem, Page } from '@sysjb/contracts';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useMemo, useState } from 'react';
import { Main } from '@/admin/components/layout/main';
import { ReportTable } from '@/admin/components/report-table';
import { Button } from '@/admin/components/ui/button';
import { Input } from '@/admin/components/ui/input';
import { UrlPagination } from '@/admin/components/url-pagination';
import { type UnitsQuery, unitsHref } from '@/lib/admin/units';
import { GiftMilharCard, type GiftMilharState } from './components/gift-milhar-card';
import { type UnitDetailState, UnitSettingsSheet } from './components/unit-settings-sheet';
import { unitsColumns } from './components/units-columns';

export type UnitsProps = {
  query: UnitsQuery;
  result: Page<AdminUserListItem>;
  /** Unidade aberta pela URL (?unidade=...); null = nenhuma. */
  detail: UnitDetailState | null;
  /** Tabelas de cotação da banca (para escolher); null = sem `quotes.read` ou falha ao carregar. */
  quoteTables: AdminQuoteTableSummary[] | null;
  /** Milhar Brinde da banca; null = o perfil não vê (sem `quotes.read` nem `quotes.manage`). */
  giftMilhar: GiftMilharState | null;
  permissions: { manageUnits: boolean; manageQuotes: boolean };
};

/** Unidade aberta: a da URL, ou a que o operador acabou de abrir/fechar enquanto a navegação não termina. */
function useOpenUnit(urlId: string | null) {
  const [override, setOverride] = useState<{ id: string | null } | null>(null);
  const [seenId, setSeenId] = useState(urlId);
  if (seenId !== urlId) {
    setSeenId(urlId);
    setOverride(null);
  }
  return [override ? override.id : urlId, (id: string | null) => setOverride({ id })] as const;
}

/** Busca na API (nome, CPF, telefone ou número), desde a primeira página. */
function UnitsSearch({ query }: { query: UnitsQuery }) {
  const router = useRouter();
  const [search, setSearch] = useState(query.search);
  function submit(event: FormEvent) {
    event.preventDefault();
    router.push(unitsHref({ search: search.trim(), pageSize: query.pageSize }));
  }
  return (
    <form role="search" aria-label="Buscar unidades" onSubmit={submit} className="flex gap-2 print:hidden">
      <Input
        type="search"
        aria-label="Nome, CPF, telefone ou número"
        placeholder="Nome, CPF, telefone ou número..."
        value={search}
        maxLength={100}
        onChange={(event) => setSearch(event.target.value)}
        className="h-9 w-full sm:w-80"
      />
      <Button type="submit" variant="outline">
        <Search /> Buscar
      </Button>
    </form>
  );
}

/** Unidades: as configurações de cada apostador e o Milhar Brinde da banca. */
export function Units({ query, result, detail, quoteTables, giftMilhar, permissions }: UnitsProps) {
  const router = useRouter();
  const baseHref = unitsHref(query);
  const [openId, setOpenId] = useOpenUnit(detail?.id ?? null);
  const detailHref = useCallback((id: string) => unitsHref(query, id), [query]);
  const onOpen = useCallback((id: string) => setOpenId(id), [setOpenId]);
  const columns = useMemo(() => unitsColumns(detailHref, onOpen), [detailHref, onOpen]);

  return (
    <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Unidades</h1>
        <p className="text-muted-foreground">
          Região, comissão, tabela de cotação, Milhar Brinde, retenção de prêmios e limite diário de cada unidade.
          Clique no nome para ver ou alterar.
        </p>
      </div>
      {giftMilhar && <GiftMilharCard state={giftMilhar} canManage={permissions.manageQuotes} />}
      <UnitsSearch key={query.search} query={query} />
      <ReportTable
        label="Unidades"
        columns={columns}
        rows={result.items}
        rowKey={(unit) => unit.id}
        emptyText={query.search ? 'Nenhuma unidade encontrada para essa busca.' : 'Nenhuma unidade cadastrada.'}
      />
      <UrlPagination
        page={result.page}
        totalPages={result.totalPages}
        pageSize={query.pageSize}
        hrefFor={(page, pageSize = query.pageSize) => unitsHref({ ...query, page, pageSize })}
      />
      <UnitSettingsSheet
        openId={openId}
        detail={detail && detail.id === openId ? detail : null}
        quoteTables={quoteTables}
        canManage={permissions.manageUnits}
        onClose={() => {
          setOpenId(null);
          router.push(baseHref, { scroll: false });
        }}
      />
    </Main>
  );
}
