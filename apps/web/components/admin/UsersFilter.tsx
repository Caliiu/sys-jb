import type { AdminPromoterOption } from '@sysjb/contracts';
import { Download, Search } from 'lucide-react';
import Link from 'next/link';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { usersExportHref, type UsersQuery } from '@/lib/admin/users-query';
import AutoSubmitSelect from './AutoSubmitSelect';
import { filterSelectClass as selectClass, toolButtonClass } from './filter-styles';
import PageSizeSelect from './PageSizeSelect';
import PrintButton from './PrintButton';

interface UsersFilterProps {
  query: UsersQuery;
  /** Promotores para o filtro; null = operador sem acesso à lista (o filtro não aparece). */
  promoters: AdminPromoterOption[] | null;
}

/**
 * Filtros da lista de unidades: promotor, status, resultados por página e pesquisa, mais Imprimir e Exportar.
 * É um formulário GET comum: o filtro vive na URL (link compartilhável, voltar funciona); os selects enviam ao
 * mudar e a pesquisa, com Enter ou a lupa.
 */
export default function UsersFilter({ query, promoters }: UsersFilterProps) {
  const filtered = query.search !== '' || query.status !== '' || query.promoterId !== '';

  return (
    <form
      method="get"
      action={ADMIN_ROUTES.users}
      role="search"
      aria-label="Filtrar unidades"
      className="flex flex-col gap-2.5 px-3 pt-3 print:hidden"
    >
      <p className="text-[12.5px] font-bold">Filtro:</p>

      {promoters && (
        <>
          <label htmlFor="users-promoter" className="sr-only">
            Promotor
          </label>
          <AutoSubmitSelect
            id="users-promoter"
            name="promoterId"
            defaultValue={query.promoterId}
            className={selectClass}
          >
            <option value="">&lt; Todos os promotores &gt;</option>
            {promoters.map((promoter) => (
              <option key={promoter.id} value={promoter.id}>
                {promoter.displayId} | {promoter.name}
              </option>
            ))}
          </AutoSubmitSelect>
        </>
      )}

      <label htmlFor="users-status" className="sr-only">
        Status
      </label>
      <AutoSubmitSelect id="users-status" name="status" defaultValue={query.status} className={selectClass}>
        <option value="">Todas as unidades</option>
        <option value="ACTIVE">Unidades ativas</option>
        <option value="BLOCKED">Unidades bloqueadas</option>
      </AutoSubmitSelect>

      <div className="flex flex-col gap-2 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <PageSizeSelect id="users-page-size" value={query.pageSize} />

        <div className="flex flex-wrap items-center gap-1.5">
          <label htmlFor="users-search" className="text-[12.5px]">
            Pesquisar
          </label>
          <div className="flex">
            <input
              id="users-search"
              name="search"
              type="search"
              defaultValue={query.search}
              maxLength={100}
              placeholder="Nome, CPF, telefone ou ID"
              className="h-9 w-52 rounded-l-sm border border-admin-border bg-admin-surface px-2.5 text-[12.5px] outline-none focus:border-admin-accent"
            />
            <button
              type="submit"
              aria-label="Buscar"
              className="flex h-9 w-9 items-center justify-center rounded-r-sm border border-l-0 border-admin-border bg-[#f4f4f4] hover:bg-[#e7e7e7]"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {filtered && (
            <Link href={ADMIN_ROUTES.users} className={toolButtonClass}>
              Limpar
            </Link>
          )}
          <PrintButton className={toolButtonClass} />
          <a
            href={usersExportHref(query)}
            download
            className="flex h-9 items-center gap-1.5 rounded-sm bg-admin-success px-3 text-[12.5px] font-semibold text-white hover:brightness-95"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exportar
          </a>
        </div>
      </div>
    </form>
  );
}
