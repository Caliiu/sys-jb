import { headers } from 'next/headers';
import { adminApi } from '@/lib/admin/admin-api';
import { readOperatorToken } from '@/lib/admin/admin-session';
import { hostnameOnly, isAdminHost, serviceKeyFor } from '@/lib/server-env';

/**
 * Logo da banca do operador logado, no host do painel (/marca/logo). Rotas não passam pelo layout do painel,
 * então o host é conferido aqui; a sessão, pela API.
 */
export async function GET() {
  const hostname = hostnameOnly((await headers()).get('host'));
  const token = await readOperatorToken();
  if (!hostname || !isAdminHost(hostname) || !serviceKeyFor(hostname) || !token) {
    return new Response(null, { status: 404 });
  }

  const logo = await adminApi.brandingLogo({ hostname, token });
  if (!logo.ok) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo.data), {
    headers: { 'Content-Type': logo.contentType, 'Cache-Control': 'private, max-age=86400' },
  });
}
