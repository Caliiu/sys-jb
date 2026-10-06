import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Credenciais de um gateway (o que o gerente digita no painel). Nunca vão para log, resposta ou auditoria. */
export interface GatewayCredentials {
  clientId: string;
  clientSecret: string;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Contexto amarrado ao texto cifrado: a credencial de uma banca/gateway não serve se copiada para outra linha. */
const context = (tenantId: string, gateway: string) => Buffer.from(`${tenantId}:${gateway}`, 'utf8');

/** AES-256-GCM: iv (12) + tag (16) + texto cifrado do JSON das credenciais. */
export function sealCredentials(key: Buffer, tenantId: string, gateway: string, credentials: GatewayCredentials) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(context(tenantId, gateway));
  const body = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

/** Abre o que sealCredentials gravou; null se a chave mudou, o conteúdo foi alterado ou é de outra banca/gateway. */
export function openCredentials(
  key: Buffer,
  tenantId: string,
  gateway: string,
  sealed: Uint8Array,
): GatewayCredentials | null {
  const data = Buffer.from(sealed);
  if (data.length <= IV_BYTES + TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, IV_BYTES));
    decipher.setAAD(context(tenantId, gateway));
    decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const text = Buffer.concat([decipher.update(data.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString(
      'utf8',
    );
    const parsed = JSON.parse(text) as Partial<GatewayCredentials>;
    return typeof parsed.clientId === 'string' && typeof parsed.clientSecret === 'string'
      ? { clientId: parsed.clientId, clientSecret: parsed.clientSecret }
      : null;
  } catch {
    return null;
  }
}

/** Pista para o painel reconhecer a credencial sem mostrá-la: prefixo (até o "_") e os 4 últimos do Client ID. */
export function credentialsHint(clientId: string): string {
  const prefix = /^[a-z]{1,4}_/i.exec(clientId)?.[0] ?? '';
  // Aspas e < > não entram na pista (o banco recusa): viram "*".
  return `${prefix}…${clientId.slice(-4).replace(/[<>"'`]/g, '*')}`;
}
