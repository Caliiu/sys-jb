import { ImageResponse } from 'next/og';
import { tenantInitial } from '@/lib/favicon';
import { PWA_ICON_VARIANTS, isPwaIconVariant, loadTenantLogo, logoIcon } from '@/lib/pwa-icon';
import { resolveTenant } from '@/lib/request-context';

/** Muda com o hostname (cada banca tem o seu); a versão da logo e a cor vão no endereço (?v=), então dá para guardar. */
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=3600', Vary: 'Host' };

/**
 * Ícone do app instalado (manifesto e iPhone): a logo da banca sobre a cor principal dela (tema); sem logo (ou logo
 * ilegível), a inicial da banca em branco sobre a mesma cor. Só as variantes do manifesto: qualquer outro pedido é 404 (não gera
 * imagem sob demanda para valores arbitrários).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const variant = (await params).size;
  if (!isPwaIconVariant(variant)) return new Response('Not found', { status: 404 });
  const { size } = PWA_ICON_VARIANTS[variant];

  const ctx = await resolveTenant();
  if (!ctx.ok) return new Response('Not found', { status: 404 });

  const logo = await loadTenantLogo(ctx.hostname, ctx.tenant.logoUrl);
  const png = logo ? await logoIcon(logo, variant, ctx.tenant.primaryColor) : null;
  if (png) {
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', ...CACHE_HEADERS } });
  }

  // O fundo cobre todo o quadrado e a letra fica no centro: vale como ícone normal e como "maskable".
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
    { width: size, height: size, headers: CACHE_HEADERS },
  );
}
