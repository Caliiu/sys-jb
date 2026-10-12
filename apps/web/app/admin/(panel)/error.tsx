'use client';

import { Main } from '@/admin/components/layout/main';
import { GeneralError } from '@/admin/features/errors/general-error';

/** Falha inesperada numa página do painel (o menu e o cabeçalho continuam). */
export default function PanelError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Main>
      <GeneralError onRetry={reset} className="h-[calc(100svh-8rem)]" />
    </Main>
  );
}
