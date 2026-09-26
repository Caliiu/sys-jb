import { USER_STATUSES } from '@sysjb/contracts';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { STATUS_LABELS } from '@/lib/admin/format';
import type { UsersQuery } from '@/lib/admin/users-query';

const fieldClass =
  'h-10 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';

/**
 * Busca e filtro por status. É um formulário GET comum: o filtro vive na URL (link compartilhável,
 * botão voltar funciona) e não precisa de JavaScript no navegador.
 */
export default function UsersFilter({ query }: { query: UsersQuery }) {
  const filtered = query.search !== '' || query.status !== '';

  return (
    <form method="get" action={ADMIN_ROUTES.users} role="search" className="mb-4 flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <label htmlFor="users-search" className="sr-only">
          Buscar usuários
        </label>
        <input
          id="users-search"
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

      <label htmlFor="users-status" className="sr-only">
        Status
      </label>
      <select id="users-status" name="status" defaultValue={query.status} className={fieldClass}>
        <option value="">Todos os status</option>
        {USER_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="h-10 rounded-lg bg-admin-accent px-4 text-[13px] font-semibold text-white active:bg-admin-accent-dark"
      >
        Buscar
      </button>
      {filtered && (
        <Link
          href={ADMIN_ROUTES.users}
          className="flex h-10 items-center justify-center rounded-lg border border-admin-border px-4 text-[13px] font-semibold text-admin-text"
        >
          Limpar
        </Link>
      )}
    </form>
  );
}
