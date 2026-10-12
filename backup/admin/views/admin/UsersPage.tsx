import type { AdminPromoterOption, AdminUserListItem, Page } from '@sysjb/contracts';
import { Download } from 'lucide-react';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import FiltersCard from '@/components/admin/FiltersCard';
import { smallButtonClass } from '@/components/admin/filter-styles';
import Pagination from '@/components/admin/Pagination';
import PrintButton from '@/components/admin/PrintButton';
import UsersFilter from '@/components/admin/UsersFilter';
import UsersTable from '@/components/admin/UsersTable';
import { usersExportHref, usersHref, type UsersQuery } from '@/lib/admin/users-query';

interface UsersPageProps {
  query: UsersQuery;
  result: Page<AdminUserListItem>;
  /** Opções do filtro por promotor; null = o filtro não aparece. */
  promoters?: AdminPromoterOption[] | null;
}

/** Apostadores (usuários) da banca: filtros e a lista paginada (tudo na URL). Componente de servidor. */
export default function UsersPage({ query, result, promoters = null }: UsersPageProps) {
  return (
    <div className="space-y-6">
      <AdminPageTitle title="Apostadores" />
      <FiltersCard>
        <UsersFilter query={query} promoters={promoters} />
      </FiltersCard>

      <section
        aria-label="Resultados"
        className="rounded-xl border border-admin-border bg-admin-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <div className="flex flex-wrap items-center gap-3 px-6 pt-6">
          <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
            Total: <strong className="font-semibold text-admin-text">{result.total}</strong>
          </span>
          <div className="ml-auto flex gap-2 print:hidden">
            <PrintButton className={smallButtonClass} />
            <a href={usersExportHref(query)} download className={smallButtonClass}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              Exportar
            </a>
          </div>
        </div>
        <div className="mx-6 mt-5 border-t border-admin-border">
          <UsersTable items={result.items} />
        </div>
        <Pagination
          hrefFor={(page) => usersHref({ ...query, page })}
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          pageSize={result.pageSize}
        />
      </section>
    </div>
  );
}
