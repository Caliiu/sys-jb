import Link from 'next/link';

interface PaginationProps {
  /** Endereço de uma página (a página vive na URL, junto com a busca e os filtros). */
  hrefFor: (page: number) => string;
  page: number;
  totalPages: number;
  total: number;
  /** [singular, plural] do que está sendo listado. */
  unit?: readonly [string, string];
}

const linkClass = 'text-[12.5px] font-semibold text-admin-text hover:underline';
const disabledClass = 'text-[12.5px] font-semibold text-admin-muted opacity-40';

/** Anterior/Próxima como links, preservando busca e filtros (quem monta o endereço é `hrefFor`). */
export default function Pagination({
  hrefFor,
  page,
  totalPages,
  total,
  unit = ['usuário', 'usuários'],
}: PaginationProps) {
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between border-t border-admin-border px-4 py-3">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={linkClass}>
          Anterior
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          Anterior
        </span>
      )}
      <span className="text-[12.5px] text-admin-muted" aria-live="polite">
        Página {page} de {totalPages} · {total} {total === 1 ? unit[0] : unit[1]}
      </span>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} rel="next" className={linkClass}>
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
