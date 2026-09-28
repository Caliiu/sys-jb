'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Relógio a partir do horário do servidor (vindo com a página) mais o tempo decorrido neste aparelho: os
 * horários de venda não dependem do relógio do celular, que pode estar errado.
 */
export function serverClock(serverNowIso: string, now: () => number = Date.now): () => string {
  const offset = Date.parse(serverNowIso) - now();
  return () => new Date(now() + offset).toISOString();
}

/**
 * Horário do servidor para a tela: `now` (ISO) avança sozinho a cada `everyMs` com a página aberta, então listas
 * de extrações abertas e o "Hoje" (depois da meia-noite) se atualizam. `clock()` dá o instante exato, para os
 * handlers (ex.: conferir antes de comprar); `refresh()` atualiza `now` na hora (ex.: ao voltar para a lista).
 */
export function useServerNow(serverNowIso: string, everyMs = 30_000) {
  const [clock] = useState(() => serverClock(serverNowIso));
  // Começa no horário do servidor: igual no HTML e na hidratação.
  const [now, setNow] = useState(serverNowIso);
  const refresh = useCallback(() => setNow(clock()), [clock]);

  useEffect(() => {
    const id = window.setInterval(refresh, everyMs);
    return () => window.clearInterval(id);
  }, [refresh, everyMs]);

  return { now, clock, refresh };
}
