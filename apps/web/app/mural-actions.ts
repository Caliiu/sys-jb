'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { hostnameOnly, serviceKeyFor } from '@/lib/server-env';
import { readSessionToken } from '@/lib/session';

const idSchema = z.uuid();

/**
 * Registra que o jogador da sessão viu o mural (vale para "Apenas uma vez"; nos "Sempre" a API não grava
 * nada). Server action é endpoint público: confere o formato e usa a sessão do cookie HttpOnly. Falha não
 * interrompe nada na tela: no pior caso o mural aparece de novo na próxima abertura.
 */
export async function markMuralSeenAction(id: unknown): Promise<{ ok: boolean }> {
  const muralId = idSchema.safeParse(id);
  if (!muralId.success) return { ok: false };
  const hostname = hostnameOnly((await headers()).get('host'));
  const sessionToken = await readSessionToken();
  if (!hostname || !serviceKeyFor(hostname) || !sessionToken) return { ok: false };

  const res = await apiRequest<null>(hostname, 'POST', `/v1/murals/${muralId.data}/seen`, {}, { sessionToken });
  return { ok: res.ok };
}
