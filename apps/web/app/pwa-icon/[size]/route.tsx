import { ImageResponse } from 'next/og';
import { tenantInitial } from '@/lib/favicon';
import { resolveTenant } from '@/lib/request-context';

/** Tamanhos oferecidos no manifesto: qualquer outro pedido é 404 (não gera imagem sob demanda para valores arbitrários). */
const SIZES = new Set([192, 512]);

/**
 * Ícone do app instalado: a inicial da banca, em branco, sobre a cor da banca. O fundo cobre todo o
 * quadrado e a letra fica no centro, então vale tanto como ícone normal quanto "maskable" (recortável).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response('Not found', { status: 404 });

  const ctx = await resolveTenant();
  if (!ctx.ok) return new Response('Not found', { status: 404 });

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: ctx.tenant.primaryColor,
        color: '#ffffff',
        fontSize: Math.round(size * 0.5),
        fontWeight: 800,
      }}
    >
      {tenantInitial(ctx.tenant.name)}
    </div>,
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=3600', Vary: 'Host' } },
  );
}
