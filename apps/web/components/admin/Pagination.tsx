import Link from 'next/link';

interface PaginationProps {
  /** Endereço de uma página (a página vive na URL, junto com a busca e os filtros). */
  hrefFor: (page: number) => string;
  page: number;
  totalPages: number;
  total: number;
  /** Itens por página (para o "Mostrando de X até Y"). */
  pageSize: number;
  /** [singular, plural] do que está sendo listado. */
  unit?: readonly [string, string];
}

/** Páginas numeradas mostradas: primeira, última e até 2 vizinhas da atual; `null` = reticências. */
export function pageWindow(page: number, totalPages: number): Array<number | null> {
  const pages: Array<number | null> = [];
  for (let n = 1; n <= totalPages; n += 1) {
    if (n === 1 || n === totalPages || Math.abs(n - page) <= 2) pages.push(n);
    else if (pages.at(-1) !== null) pages.push(null);
  }
  return pages;
}

const cellClass = 'flex h-8 min-w-8 items-center justify-center border-l border-admin-border px-3 text-[12.5px]';

/** "Mostrando de X até Y de Z" e Anterior / páginas / Próximo como links, preservando busca e filtros. */
export default function Pagination({
  hrefFor,
  page,
  totalPages,
  total,
  pageSize,
  unit = ['unidade', 'unidades'],
}: PaginationProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Paginação"
      className="flex flex-col gap-2 border-t border-admin-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden"
    >
      <span className="text-[12.5px] text-admin-text" aria-live="polite">
        {total === 0
          ? 'Nenhum registro'
          : `Mostrando de ${start} até ${end} de ${total} ${total === 1 ? unit[0] : unit[1]}`}
      </span>
      <div className="flex self-end overflow-hidden rounded border border-admin-border [&>*:first-child]:border-l-0">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} rel="prev" className={`${cellClass} hover:bg-admin-bg`}>
            Anterior
          </Link>
        ) : (
          <span aria-disabled="true" className={`${cellClass} text-admin-muted`}>
            Anterior
          </span>
        )}
        {pageWindow(page, totalPages).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className={`${cellClass} text-admin-muted`} aria-hidden>
              …
            </span>
          ) : n === page ? (
            <span
              key={n}
              aria-current="page"
              className={`${cellClass} border-admin-accent bg-admin-accent font-semibold text-white`}
            >
              {n}
            </span>
          ) : (
            <Link key={n} href={hrefFor(n)} aria-label={`Página ${n}`} className={`${cellClass} hover:bg-admin-bg`}>
              {n}
            </Link>
          ),
        )}
        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} rel="next" className={`${cellClass} hover:bg-admin-bg`}>
            Próximo
          </Link>
        ) : (
          <span aria-disabled="true" className={`${cellClass} text-admin-muted`}>
            Próximo
          </span>
        )}
      </div>
    </nav>
  );
}
