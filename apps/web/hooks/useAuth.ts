'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { type LoginInput, loginAction, logoutAction, type RegisterInput, registerAction } from '../app/auth-actions';
import { leavePush } from '../lib/push-client';
import { ApiError } from '../services/http';

/** Cadastro, login e logout do cliente. Falhas viram ApiError com mensagem pronta para exibir. */
export function useAuth() {
  const router = useRouter();

  return useMemo(
    () => ({
      async register(input: RegisterInput): Promise<void> {
        const res = await registerAction(input);
        if (!res.ok) throw new ApiError(res.status, res.code, res.message);
      },
      async login(input: LoginInput): Promise<void> {
        const res = await loginAction(input);
        if (!res.ok) throw new ApiError(res.status, res.code, res.message);
        // O cookie de sessão foi gravado no servidor; recarrega os componentes de servidor.
        router.refresh();
      },
      async logout(): Promise<void> {
        // Antes de encerrar a sessão (a API precisa dela para tirar o aparelho da conta).
        await leavePush();
        await logoutAction();
        router.refresh();
      },
    }),
    [router],
  );
}
