import type { AdminUserListItem, Page } from '@sysjb/contracts';
import Pagination from '@/components/admin/Pagination';
import UsersFilter from '@/components/admin/UsersFilter';
import UsersTable from '@/components/admin/UsersTable';
import { usersHref, type UsersQuery } from '@/lib/admin/users-query';

interface UsersPageProps {
  query: UsersQuery;
  result: Page<AdminUserListItem>;
  /** O nome do promotor vira link para a página dele. */
  canReadPromoters?: boolean;
}

/** Lista de usuários da banca, com busca, filtro e paginação (tudo na URL). Componente de servidor. */
export default function UsersPage({ query, result, canReadPromoters = false }: UsersPageProps) {
  return (
    <div>
      <h1 className="mb-4 text-[18px] font-bold text-admin-text">Usuários</h1>
      <UsersFilter query={query} />
      <section aria-label="Resultados" className="overflow-hidden rounded-xl bg-admin-surface shadow-admin">
        <UsersTable items={result.items} canReadPromoters={canReadPromoters} />
        <Pagination
          hrefFor={(page) => usersHref({ ...query, page })}
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
        />
      </section>
    </div>
  );
}
