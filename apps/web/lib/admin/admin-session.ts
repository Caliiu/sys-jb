import 'server-only';
import { cookies } from 'next/headers';

/**
 * Cookie da sessão do operador. HttpOnly (o token nunca chega ao JavaScript do navegador) e sem
 * `Domain`: fica preso ao host do painel (admin.<domínio>), então os apps das bancas nem chegam a
 * recebê-lo. Em produção usa o prefixo `__Host-` (só com Secure, caminho / e sem Domain).
 */
export const OPERATOR_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-sysjb_operator' : 'sysjb_operator';

/** Formato do token da API (256 bits em base64url). Qualquer outro valor de cookie é ignorado. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export async function readOperatorToken(): Promise<string | undefined> {
  const value = (await cookies()).get(OPERATOR_COOKIE)?.value;
  return value && TOKEN_FORMAT.test(value) ? value : undefined;
}

export async function writeOperatorToken(token: string, expiresAt: string): Promise<void> {
  (await cookies()).set(OPERATOR_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export async function clearOperatorToken(): Promise<void> {
  (await cookies()).set(OPERATOR_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
