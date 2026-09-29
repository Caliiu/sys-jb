import type { AdminPromoterOption, AdminUserListItem, Page } from '@sysjb/contracts';
import AdminBox from '@/components/admin/AdminBox';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import Pagination from '@/components/admin/Pagination';
import UsersFilter from '@/components/admin/UsersFilter';
import UsersTable from '@/components/admin/UsersTable';
import { usersHref, type UsersQuery } from '@/lib/admin/users-query';

interface UsersPageProps {
  query: UsersQuery;
  result: Page<AdminUserListItem>;
  /** Opções do filtro por promotor; null = o filtro não aparece. */
  promoters?: AdminPromoterOption[] | null;
}

/** Unidades (usuários) da banca, com filtros, pesquisa e paginação (tudo na URL). Componente de servidor. */
export default function UsersPage({ query, result, promoters = null }: UsersPageProps) {
  return (
    <div>
      <AdminPageTitle title="Unidades Registradas" />
      <AdminBox title="Lista de unidades">
        <UsersFilter query={query} promoters={promoters} />
        <UsersTable items={result.items} />
        <Pagination
          hrefFor={(page) => usersHref({ ...query, page })}
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          pageSize={result.pageSize}
        />
      </AdminBox>
    </div>
  );
}
