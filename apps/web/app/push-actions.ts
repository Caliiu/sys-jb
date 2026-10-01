'use server';

import { PUSH_LIMITS, type PushSubscriptionRequest } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { hostnameOnly, serviceKeyFor } from '@/lib/server-env';
import { readSessionToken } from '@/lib/session';

/**
 * Inscrição do aparelho nas notificações (jogador logado). Server action é endpoint público: o formato é conferido
 * aqui antes de seguir (a API confere tudo de novo, inclusive se o serviço de push é conhecido). Só o necessário vai
 * adiante (o `toJSON()` do navegador traz também expirationTime).
 */
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(PUSH_LIMITS.endpointMax),
  keys: z.object({ p256dh: z.string().max(128), auth: z.string().max(64) }),
});

async function session(): Promise<{ host: string; token: string } | null> {
  const host = hostnameOnly((await headers()).get('host'));
  const token = await readSessionToken();
  return host && token && serviceKeyFor(host) ? { host, token } : null;
}

/** true = a API guardou a inscrição. */
export async function savePushSubscriptionAction(input: unknown): Promise<boolean> {
  const parsed = subscriptionSchema.safeParse(input);
  const ctx = await session();
  if (!parsed.success || !ctx) return false;
  const body: PushSubscriptionRequest = { endpoint: parsed.data.endpoint, keys: parsed.data.keys };
  const res = await apiRequest<null>(ctx.host, 'POST', '/v1/me/push-subscriptions', body, { sessionToken: ctx.token });
  return res.ok;
}

/** Tira o aparelho da conta (antes de sair). Falha não impede a saída. */
export async function removePushSubscriptionAction(endpoint: unknown): Promise<void> {
  const ctx = await session();
  if (typeof endpoint !== 'string' || endpoint.length > PUSH_LIMITS.endpointMax || !ctx) return;
  await apiRequest<null>(ctx.host, 'DELETE', '/v1/me/push-subscriptions', { endpoint }, { sessionToken: ctx.token });
}
