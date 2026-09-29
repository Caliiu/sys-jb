import { headers } from 'next/headers';
import { apiRequestImage } from '@/lib/api-client';
import { hostnameOnly, isAdminHost, serviceKeyFor } from '@/lib/server-env';
import { readSessionToken } from '@/lib/session';

/**
 * Imagem do mural para o jogador logado (só murais no ar; a API confere a sessão e a banca). O endereço traz a
 * versão (?v=), então o navegador pode guardar a imagem: uma alteração no painel muda o endereço.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const hostname = hostnameOnly((await headers()).get('host'));
  const sessionToken = await readSessionToken();
  if (!hostname || isAdminHost(hostname) || !serviceKeyFor(hostname) || !sessionToken) {
    return new Response(null, { status: 404 });
  }

  const { id } = await params;
  const image = await apiRequestImage(hostname, `/v1/murals/${encodeURIComponent(id)}/image`, { sessionToken });
  if (!image.ok) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: { 'Content-Type': image.contentType, 'Cache-Control': 'private, max-age=86400' },
  });
}
