import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface PaginationProps {
  /** Endereço de uma página (a página vive na URL, junto com a busca e os filtros). */
  hrefFor: (page: number) => string;
  page: number;
  totalPages: number;
  total: number;
  /** Itens por página (para o "Mostrando X a Y"). */
  pageSize: number;
  /** [singular, plural] do que está sendo listado. */
  unit?: readonly [string, string];
}

const arrowClass = 'flex h-8 w-8 items-center justify-center rounded-md border border-admin-border';

/** Rodapé das listas: "Mostrando X a Y de Z" e "Página N de M" com anterior/próxima (links que mantêm os filtros). */
export default function Pagination({
  hrefFor,
  page,
  totalPages,
  total,
  pageSize,
  unit = ['registro', 'registros'],
}: PaginationProps) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Paginação"
      className="flex flex-col gap-3 px-6 py-5 text-[14px] text-admin-muted sm:flex-row sm:items-center sm:justify-between print:hidden"
    >
      <span aria-live="polite">
        {total === 0 ? 'Nenhum registro' : `Mostrando ${start} a ${end} de ${total} ${total === 1 ? unit[0] : unit[1]}`}
      </span>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        {page > 1 ? (
          <Link
            href={hrefFor(page - 1)}
            rel="prev"
            aria-label="Anterior"
            className={`${arrowClass} text-admin-text hover:bg-admin-hover`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <span aria-disabled="true" aria-label="Anterior" className={`${arrowClass} opacity-40`}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </span>
        )}
        <span className="px-1 tabular-nums">
          Página {page} de {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={hrefFor(page + 1)}
            rel="next"
            aria-label="Próximo"
            className={`${arrowClass} text-admin-text hover:bg-admin-hover`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <span aria-disabled="true" aria-label="Próximo" className={`${arrowClass} opacity-40`}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
