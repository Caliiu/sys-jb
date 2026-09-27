import type { AdminPromoterListItem, Page } from '@sysjb/contracts';
import { Search } from 'lucide-react';
import Link from 'next/link';
import AddPromoterPanel from '@/components/admin/AddPromoterPanel';
import Pagination from '@/components/admin/Pagination';
import PromotersTable from '@/components/admin/PromotersTable';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { type PromotersQuery, promotersHref } from '@/lib/admin/promoters-query';

interface PromotersPageProps {
  query: PromotersQuery;
  result: Page<AdminPromoterListItem>;
  /** Perfil com permissão de promover, alterar e remover (a API confere de novo). */
  canManage: boolean;
}

const fieldClass =
  'h-10 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';

/** Promotores da banca: quem são, a comissão e quantos jogadores trouxeram. Componente de servidor. */
export default function PromotersPage({ query, result, canManage }: PromotersPageProps) {
  return (
    <div>
      <h1 className="mb-4 text-[18px] font-bold text-admin-text">Promotores</h1>

      {canManage && <AddPromoterPanel />}

      <form
        method="get"
        action={ADMIN_ROUTES.promoters}
        role="search"
        aria-label="Buscar promotores"
        className="mb-4 flex flex-col gap-2 sm:flex-row"
      >
        <div className="relative flex-1">
          <label htmlFor="promoters-search" className="sr-only">
            Buscar promotores
          </label>
          <input
            id="promoters-search"
            name="search"
            type="search"
            defaultValue={query.search}
            maxLength={100}
            placeholder="Buscar por nome, CPF, telefone ou ID"
            className={`${fieldClass} w-full pl-9`}
          />
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted"
            aria-hidden
          />
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg bg-admin-accent px-4 text-[13px] font-semibold text-white active:bg-admin-accent-dark"
        >
          Buscar
        </button>
        {query.search !== '' && (
          <Link
            href={ADMIN_ROUTES.promoters}
            className="flex h-10 items-center justify-center rounded-lg border border-admin-border px-4 text-[13px] font-semibold text-admin-text"
          >
            Limpar
          </Link>
        )}
      </form>

      <section aria-label="Resultados" className="overflow-hidden rounded-xl bg-admin-surface shadow-admin">
        <PromotersTable items={result.items} />
        <Pagination
          hrefFor={(page) => promotersHref({ ...query, page })}
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          unit={['promotor', 'promotores']}
        />
      </section>
    </div>
  );
}
