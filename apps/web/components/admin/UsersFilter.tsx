import type { AdminPromoterOption } from '@sysjb/contracts';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { PAGE_SIZES } from '@/lib/admin/page-size';
import type { UsersQuery } from '@/lib/admin/users-query';
import FilterActions from './FilterActions';
import FilterForm from './FilterForm';
import FilterSelect from './FilterSelect';
import { controlClass, labelClass } from './filter-styles';

interface UsersFilterProps {
  query: UsersQuery;
  /** Promotores para o filtro; null = sem a lista (o filtro não aparece). */
  promoters: AdminPromoterOption[] | null;
}

/** Filtros da lista de apostadores: pesquisa, promotor, status e resultados por página; Pesquisar aplica. */
export default function UsersFilter({ query, promoters }: UsersFilterProps) {
  return (
    <FilterForm action={ADMIN_ROUTES.users} role="search" aria-label="Filtrar apostadores">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <label htmlFor="users-search" className={labelClass}>
            Pesquisar
          </label>
          <input
            id="users-search"
            name="search"
            type="search"
            defaultValue={query.search}
            maxLength={100}
            placeholder="Nome, CPF, telefone ou ID"
            className={controlClass}
          />
        </div>
        {promoters && (
          <FilterSelect id="users-promoter" label="Promotor" name="promoterId" defaultValue={query.promoterId}>
            <option value="">Todos</option>
            {promoters.map((promoter) => (
              <option key={promoter.id} value={promoter.id}>
                {promoter.displayId} - {promoter.name}
              </option>
            ))}
          </FilterSelect>
        )}
        <FilterSelect id="users-status" label="Status" name="status" defaultValue={query.status}>
          <option value="">Todos</option>
          <option value="ACTIVE">Ativos</option>
          <option value="BLOCKED">Bloqueados</option>
        </FilterSelect>
        <FilterSelect
          id="users-page-size"
          label="Resultados por página"
          name="pageSize"
          defaultValue={String(query.pageSize)}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </FilterSelect>
      </div>
      <FilterActions clearHref={ADMIN_ROUTES.users} />
    </FilterForm>
  );
}
