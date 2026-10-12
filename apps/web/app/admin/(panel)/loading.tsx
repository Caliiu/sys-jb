import { Main } from '@/admin/components/layout/main';
import { Skeleton } from '@/admin/components/ui/skeleton';

/** Enquanto a página carrega no servidor: o menu e o cabeçalho ficam, o conteúdo vira um esqueleto. */
export default function PanelLoading() {
  return (
    <Main aria-busy="true" aria-label="Carregando">
      <Skeleton className="mb-4 h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-80 rounded-xl" />
    </Main>
  );
}
