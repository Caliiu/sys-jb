import { headers } from 'next/headers';
import { apiRequestImage } from '@/lib/api-client';
import { hostnameOnly, isAdminHost, serviceKeyFor } from '@/lib/server-env';

/**
 * Logo enviada pelo Gerente (Personalização > Identidade visual), no app da banca. Pública: aparece no login.
 * O endereço traz a versão (?v=), então o navegador pode guardar a imagem; uma troca muda o endereço.
 */
export async function GET() {
  const hostname = hostnameOnly((await headers()).get('host'));
  if (!hostname || isAdminHost(hostname) || !serviceKeyFor(hostname)) return new Response(null, { status: 404 });

  const logo = await apiRequestImage(hostname, '/v1/tenant/logo');
  if (!logo.ok) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo.data), {
    headers: { 'Content-Type': logo.contentType, 'Cache-Control': 'public, max-age=86400' },
  });
}
