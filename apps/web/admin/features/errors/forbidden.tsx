'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { Button } from '@/admin/components/ui/button';

export function ForbiddenError() {
  const router = useRouter();
  return (
    <div className="h-svh">
      <div className="m-auto flex h-full w-full flex-col items-center justify-center gap-2">
        <h1 className="text-[7rem] leading-tight font-bold">403</h1>
        <span className="font-medium">Sem permissão</span>
        <p className="text-center text-muted-foreground">
          Seu perfil não pode acessar esta página. <br />
          Fale com o gerente da banca se precisar.
        </p>
        <div className="mt-6 flex gap-4">
          <Button variant="outline" onClick={() => router.back()}>
            Voltar
          </Button>
          <Button asChild>
            <Link href={ADMIN_ROUTES.home}>Ir para o início</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
