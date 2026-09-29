import { headers } from 'next/headers';
import { adminApi } from '@/lib/admin/admin-api';
import { readOperatorToken } from '@/lib/admin/admin-session';
import { hostnameOnly, isAdminHost, serviceKeyFor } from '@/lib/server-env';

/**
 * Imagem de um mural para a pré-visualização do painel (host do painel: /mural/:id/imagem). Rotas não passam
 * pelo layout do painel, então o host é conferido aqui; a sessão e a permissão, pela API.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const hostname = hostnameOnly((await headers()).get('host'));
  const token = await readOperatorToken();
  if (!hostname || !isAdminHost(hostname) || !serviceKeyFor(hostname) || !token) {
    return new Response(null, { status: 404 });
  }

  const { id } = await params;
  const image = await adminApi.muralImage({ hostname, token }, id);
  if (!image.ok) return new Response(null, { status: image.status === 403 ? 403 : 404 });
  return new Response(new Uint8Array(image.data), {
    headers: { 'Content-Type': image.contentType, 'Cache-Control': 'private, no-store' },
  });
}
