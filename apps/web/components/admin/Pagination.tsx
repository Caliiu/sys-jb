import Link from 'next/link';
import { usersHref, type UsersQuery } from '@/lib/admin/users-query';

interface PaginationProps {
  query: UsersQuery;
  page: number;
  totalPages: number;
  total: number;
}

const linkClass = 'text-[12.5px] font-semibold text-admin-text hover:underline';
const disabledClass = 'text-[12.5px] font-semibold text-admin-muted opacity-40';

/** Anterior/Próxima como links (a página vive na URL), preservando busca e status. */
export default function Pagination({ query, page, totalPages, total }: PaginationProps) {
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between border-t border-admin-border px-4 py-3">
      {page > 1 ? (
        <Link href={usersHref({ ...query, page: page - 1 })} rel="prev" className={linkClass}>
          Anterior
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          Anterior
        </span>
      )}
      <span className="text-[12.5px] text-admin-muted" aria-live="polite">
        Página {page} de {totalPages} · {total} {total === 1 ? 'usuário' : 'usuários'}
      </span>
      {page < totalPages ? (
        <Link href={usersHref({ ...query, page: page + 1 })} rel="next" className={linkClass}>
          Próxima
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          Próxima
        </span>
      )}
    </nav>
  );
}
