import 'server-only';
import { cookies } from 'next/headers';

/**
 * Cookie da sessão do cliente. HttpOnly: o token nunca fica acessível ao JavaScript do navegador.
 * O cookie é por hostname, então cada banca (*.localhost) tem a sua sessão.
 */
export const SESSION_COOKIE = 'sysjb_session';

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function writeSessionToken(token: string, expiresAt: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export async function clearSessionToken(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
