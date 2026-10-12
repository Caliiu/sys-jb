'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { Button } from '@/admin/components/ui/button';

export function UnauthorizedError() {
  const router = useRouter();
  return (
    <div className="h-svh">
      <div className="m-auto flex h-full w-full flex-col items-center justify-center gap-2">
        <h1 className="text-[7rem] leading-tight font-bold">401</h1>
        <span className="font-medium">Acesso não autorizado</span>
        <p className="text-center text-muted-foreground">
          Sua sessão terminou ou você ainda não entrou. <br />
          Entre com seu e-mail e senha de operador.
        </p>
        <div className="mt-6 flex gap-4">
          <Button variant="outline" onClick={() => router.back()}>
            Voltar
          </Button>
          <Button asChild>
            <Link href={ADMIN_ROUTES.login}>Entrar no painel</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
