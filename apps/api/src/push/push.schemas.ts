import { PUSH_LIMITS } from '@sysjb/contracts';
import { z } from 'zod';

/** Serviços de push dos navegadores: Google (Chrome, Android, Samsung, Opera), Apple (Safari/iPhone), Mozilla, Microsoft. */
const PUSH_HOSTS = new Set(['fcm.googleapis.com', 'web.push.apple.com']);
const PUSH_HOST_SUFFIXES = ['.push.services.mozilla.com', '.notify.windows.com'];

/**
 * A API faz POST para o endpoint ao enviar: só HTTPS de um serviço de push conhecido, na porta padrão e sem
 * credenciais. Sem isso, um endpoint forjado faria a API chamar qualquer endereço (SSRF).
 */
export function isAllowedPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

const base64Url = (bytes: number, message: string) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+={0,2}$/, message)
    .refine((value) => Buffer.from(value, 'base64url').length === bytes, message);

const endpointSchema = z
  .string()
  .max(PUSH_LIMITS.endpointMax, 'Inscrição inválida.')
  .refine(isAllowedPushEndpoint, 'Serviço de notificação não aceito.');

export const pushSubscriptionSchema = z.strictObject({
  endpoint: endpointSchema,
  keys: z.strictObject({
    p256dh: base64Url(65, 'Chave da inscrição inválida.'),
    auth: base64Url(16, 'Chave da inscrição inválida.'),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.strictObject({ endpoint: z.string().max(PUSH_LIMITS.endpointMax) });
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;
