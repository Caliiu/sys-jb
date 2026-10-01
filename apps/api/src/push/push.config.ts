export interface PushConfig {
  /** Chave pública VAPID (P-256 não comprimida, base64url: 65 bytes). */
  publicKey: string;
  /** Chave privada VAPID (base64url: 32 bytes). Só na API. */
  privateKey: string;
  /** Contato do responsável (mailto: ou https:), exigido pelos serviços de push. */
  subject: string;
}

const base64UrlBytes = (value: string) => (/^[A-Za-z0-9_-]+$/.test(value) ? Buffer.from(value, 'base64url').length : 0);

/**
 * Notificações (WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY e WEB_PUSH_SUBJECT). As duas chaves vazias =
 * desligadas (null). Só uma, formato errado ou contato inválido = erro na subida, sem mostrar as chaves.
 */
export function loadPushConfig(env: NodeJS.ProcessEnv): PushConfig | null {
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? '';
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? '';
  if (!publicKey && !privateKey) return null;
  if (base64UrlBytes(publicKey) !== 65 || Buffer.from(publicKey, 'base64url')[0] !== 0x04) {
    throw new Error(
      'WEB_PUSH_VAPID_PUBLIC_KEY: chave inválida (P-256 não comprimida em base64url; gere com pnpm setup:env)',
    );
  }
  if (base64UrlBytes(privateKey) !== 32) {
    throw new Error('WEB_PUSH_VAPID_PRIVATE_KEY: chave inválida (32 bytes em base64url)');
  }
  const subject = env.WEB_PUSH_SUBJECT?.trim() ?? '';
  if (!/^mailto:[^\s@]+@[^\s@]+$/.test(subject) && !/^https:\/\/[^\s]+$/.test(subject)) {
    throw new Error('WEB_PUSH_SUBJECT: use mailto:contato@dominio ou https://...');
  }
  return { publicKey, privateKey, subject };
}
