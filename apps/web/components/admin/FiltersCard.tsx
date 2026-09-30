'use client';

import { ChevronDown, ChevronUp, FileSearch } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

/** Caixa "Filtros" das listas do painel, com Ocultar/Mostrar (os filtros continuam valendo quando ocultos). */
export default function FiltersCard({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const titleId = useId();
  const bodyId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="rounded-lg border border-admin-border bg-admin-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)] print:hidden"
    >
      <header className="flex items-center px-4 pb-4 pt-5">
        <h2 id={titleId} className="flex flex-1 items-center gap-2 text-[15px] font-semibold text-admin-text">
          <FileSearch className="h-4 w-4 text-admin-muted" aria-hidden />
          Filtros
        </h2>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-[14px] font-medium text-admin-text hover:bg-admin-hover"
        >
          {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
          {open ? 'Ocultar' : 'Mostrar'}
        </button>
      </header>
      <div id={bodyId} hidden={!open} className="px-4 pb-4">
        {children}
      </div>
    </section>
  );
}
