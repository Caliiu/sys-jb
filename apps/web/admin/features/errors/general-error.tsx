'use client';

import Link from 'next/link';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { cn } from '@/admin/lib/utils';
import { Button } from '@/admin/components/ui/button';

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean;
  /** Tenta renderizar a página de novo (o `reset` do error.tsx do Next). */
  onRetry?: () => void;
};

export function GeneralError({ className, minimal = false, onRetry }: GeneralErrorProps) {
  return (
    <div className={cn('h-svh w-full', className)}>
      <div className="m-auto flex h-full w-full flex-col items-center justify-center gap-2">
        {!minimal && <h1 className="text-[7rem] leading-tight font-bold">500</h1>}
        <span className="font-medium">Algo deu errado</span>
        <p className="text-center text-muted-foreground">
          Não foi possível carregar esta página. <br /> Tente novamente em instantes.
        </p>
        {!minimal && (
          <div className="mt-6 flex gap-4">
            {onRetry && (
              <Button variant="outline" onClick={onRetry}>
                Tentar de novo
              </Button>
            )}
            <Button asChild>
              <Link href={ADMIN_ROUTES.home}>Ir para o início</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
