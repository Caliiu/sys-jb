import { Search, X } from 'lucide-react';
import Link from 'next/link';
import { outlineButtonClass, primaryButtonClass } from './filter-styles';

/** Botões dos filtros: Pesquisar (envia o formulário) e Limpar Filtros (volta à lista sem filtro). */
export default function FilterActions({ clearHref }: { clearHref: string }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="submit" className={primaryButtonClass}>
        <Search className="h-4 w-4" aria-hidden />
        Pesquisar
      </button>
      <Link href={clearHref} className={outlineButtonClass}>
        <X className="h-4 w-4" aria-hidden />
        Limpar Filtros
      </Link>
    </div>
  );
}
