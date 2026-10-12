'use client';

import { FileDown, Printer } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Button } from '@/admin/components/ui/button';
import { Input } from '@/admin/components/ui/input';

type ReportToolbarProps = {
  /** Pesquisa só nas linhas da página aberta (a lista vem paginada do servidor). */
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  /** Link do PDF com os filtros atuais (todas as páginas). */
  pdfHref: string;
  /** Algo a mais abaixo da pesquisa (ex.: atalho para buscar fora da página). */
  children?: ReactNode;
};

/** Barra das listas em relatório: pesquisa na página, Imprimir (sem o menu e os filtros) e PDF. */
export function ReportToolbar({ search, onSearchChange, placeholder, pdfHref, children }: ReportToolbarProps) {
  const hintId = useId();
  return (
    <div className="flex flex-col gap-2 print:hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="search"
          aria-label="Pesquisar nesta página"
          aria-describedby={hintId}
          placeholder={placeholder}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-8 w-full sm:w-80"
        />
        <p id={hintId} className="sr-only">
          Filtra só as linhas desta página.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" type="button" onClick={() => window.print()}>
            <Printer /> Imprimir
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={pdfHref} target="_blank" rel="noopener">
              <FileDown /> PDF
            </a>
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}
