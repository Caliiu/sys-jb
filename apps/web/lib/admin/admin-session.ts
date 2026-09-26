import 'server-only';
import { cookies } from 'next/headers';

/**
 * Cookie da sessão do operador. HttpOnly (o token nunca chega ao JavaScript do navegador) e restrito
 * ao caminho /admin: o app do cliente nem chega a receber esse cookie. Por hostname, cada banca tem o seu.
 */
export const OPERATOR_COOKIE = 'sysjb_operator';
const COOKIE_PATH = '/admin';

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
    path: COOKIE_PATH,
    expires: new Date(expiresAt),
  });
}

export async function clearOperatorToken(): Promise<void> {
  (await cookies()).set(OPERATOR_COOKIE, '', { path: COOKIE_PATH, maxAge: 0 });
}
