'use client';

import { useEffect } from 'react';
import { syncPush } from '@/lib/push-client';

/**
 * Montado só com a conta aberta (layout raiz): manda a inscrição de notificações deste aparelho para a API na abertura
 * do app e logo depois do login. Sem permissão ou sem suporte, não faz nada.
 */
export default function PushSync({ publicKey }: { publicKey: string | null }) {
  useEffect(() => {
    void syncPush(publicKey);
  }, [publicKey]);
  return null;
}
