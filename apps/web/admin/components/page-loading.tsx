import { Loader2 } from 'lucide-react';
import { cn } from '@/admin/lib/utils';

/** Carregamento de página inteira do painel (antes do menu existir: ao abrir, recarregar ou no login). */
export function PageLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'flex min-h-svh items-center justify-center gap-2 bg-background text-sm text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
      Carregando…
    </div>
  );
}
