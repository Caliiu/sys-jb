import type { AdminUserListItem, Page } from '@sysjb/contracts';
import Pagination from '@/components/admin/Pagination';
import UsersFilter from '@/components/admin/UsersFilter';
import UsersTable from '@/components/admin/UsersTable';
import type { UsersQuery } from '@/lib/admin/users-query';

interface UsersPageProps {
  query: UsersQuery;
  result: Page<AdminUserListItem>;
}

/** Lista de usuários da banca, com busca, filtro e paginação (tudo na URL). Componente de servidor. */
export default function UsersPage({ query, result }: UsersPageProps) {
  return (
    <div>
      <h1 className="mb-4 text-[18px] font-bold text-admin-text">Usuários</h1>
      <UsersFilter query={query} />
      <section aria-label="Resultados" className="overflow-hidden rounded-xl bg-admin-surface shadow-admin">
        <UsersTable items={result.items} />
        <Pagination query={query} page={result.page} totalPages={result.totalPages} total={result.total} />
      </section>
    </div>
  );
}
