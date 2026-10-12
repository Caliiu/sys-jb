'use client';

import { ChevronLeftIcon, ChevronRightIcon, DoubleArrowLeftIcon, DoubleArrowRightIcon } from '@radix-ui/react-icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode } from 'react';
import { Button } from '@/admin/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/admin/components/ui/select';
import { cn, getPageNumbers } from '@/admin/lib/utils';
import { PAGE_SIZES } from '@/lib/admin/page-size';

type UrlPaginationProps = {
  page: number;
  totalPages: number;
  pageSize: number;
  /** Endereço de uma página (e do tamanho dela) com os filtros atuais. */
  hrefFor: (page: number, pageSize?: number) => string;
  /** Opções de tamanho da página (padrão: as do painel, 10/25/50/100). */
  sizes?: readonly number[];
  /** Texto ao lado do seletor de tamanho (e o nome acessível dele). */
  sizeLabel?: string;
};

/** Botão de página: link quando dá para ir, botão desabilitado quando não. */
function PageButton({
  href,
  label,
  className,
  current,
  children,
}: {
  href: string | null;
  label: string;
  className?: string;
  current?: boolean;
  children: ReactNode;
}) {
  if (!href) {
    return (
      <Button variant="outline" className={className} aria-label={label} disabled>
        {children}
      </Button>
    );
  }
  return (
    <Button variant={current ? 'default' : 'outline'} className={className} asChild>
      <Link href={href} aria-label={label} aria-current={current ? 'page' : undefined}>
        {children}
      </Link>
    </Button>
  );
}

/** Paginação do template, mas pela URL (a lista vem paginada do servidor). */
export function UrlPagination({
  page,
  totalPages: rawTotal,
  pageSize,
  hrefFor,
  sizes: sizeOptions = PAGE_SIZES,
  sizeLabel = 'Resultados por página',
}: UrlPaginationProps) {
  const router = useRouter();
  const totalPages = Math.max(1, rawTotal);
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;
  // Tamanho da URL fora das opções (ex.: 10 numa lista que oferece 25/50/100): continua escolhível.
  const sizes = sizeOptions.includes(pageSize) ? [...sizeOptions] : [pageSize, ...sizeOptions];

  return (
    <nav
      aria-label="Paginação"
      className={cn(
        'flex items-center justify-between overflow-clip px-2 print:hidden',
        '@max-2xl/content:flex-col-reverse @max-2xl/content:gap-4',
      )}
      style={{ overflowClipMargin: 1 }}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex w-25 items-center justify-center text-sm font-medium @2xl/content:hidden">
          Página {page} de {totalPages}
        </div>
        <div className="flex items-center gap-2 @max-2xl/content:flex-row-reverse">
          <Select value={String(pageSize)} onValueChange={(value) => router.push(hrefFor(1, Number(value)))}>
            <SelectTrigger className="h-8 w-17.5" aria-label={sizeLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {sizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="hidden text-sm font-medium sm:block">{sizeLabel}</p>
        </div>
      </div>

      <div className="flex items-center sm:space-x-6 lg:space-x-8">
        <div className="flex w-25 items-center justify-center text-sm font-medium @max-3xl/content:hidden">
          Página {page} de {totalPages}
        </div>
        <div className="flex items-center space-x-2">
          <PageButton
            href={hasPrevious ? hrefFor(1) : null}
            label="Primeira página"
            className="size-8 p-0 @max-md/content:hidden"
          >
            <DoubleArrowLeftIcon className="h-4 w-4" />
          </PageButton>
          <PageButton href={hasPrevious ? hrefFor(page - 1) : null} label="Página anterior" className="size-8 p-0">
            <ChevronLeftIcon className="h-4 w-4" />
          </PageButton>
          {getPageNumbers(page, totalPages).map((pageNumber, index) =>
            pageNumber === '...' ? (
              <span key={`dots-${index}`} className="px-1 text-sm text-muted-foreground">
                ...
              </span>
            ) : (
              <PageButton
                key={pageNumber}
                href={hrefFor(pageNumber as number)}
                label={`Ir para a página ${pageNumber}`}
                current={pageNumber === page}
                className="h-8 min-w-8 px-2"
              >
                {pageNumber}
              </PageButton>
            ),
          )}
          <PageButton href={hasNext ? hrefFor(page + 1) : null} label="Próxima página" className="size-8 p-0">
            <ChevronRightIcon className="h-4 w-4" />
          </PageButton>
          <PageButton
            href={hasNext ? hrefFor(totalPages) : null}
            label="Última página"
            className="size-8 p-0 @max-md/content:hidden"
          >
            <DoubleArrowRightIcon className="h-4 w-4" />
          </PageButton>
        </div>
      </div>
    </nav>
  );
}
