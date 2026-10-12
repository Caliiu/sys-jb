import { type ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/admin/components/ui/table';

/** Coluna da tabela: título e conteúdo da célula de uma linha. */
export interface ReportColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
}

type ReportTableProps<T> = {
  /** Nome acessível da tabela. */
  label: string;
  columns: ReadonlyArray<ReportColumn<T>>;
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Texto quando não há linhas. */
  emptyText: ReactNode;
};

/**
 * Tabela no estilo do template, sem ordenar pelo cabeçalho: as listas vêm paginadas do servidor e ordenar só a página
 * aberta enganaria.
 */
export function ReportTable<T>({ label, columns, rows, rowKey, emptyText }: ReportTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table aria-label={label}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.id}>{column.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        {rows.length > 0 && (
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((column) => (
                  <TableCell key={column.id}>{column.cell(row)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        )}
      </Table>
      {/* Fora da área que rola de lado: no celular o texto fica inteiro na largura da tela. */}
      {rows.length === 0 && (
        <p role="status" className="border-t px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      )}
    </div>
  );
}
