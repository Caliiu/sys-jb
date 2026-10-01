import type { MetadataRoute } from 'next';
import { pwaIconUrl } from '@/lib/pwa-icon';
import { resolveTenant } from '@/lib/request-context';

const FALLBACK = { name: 'Painel do Jogador', primaryColor: '#DF2120', logoUrl: null };

/**
 * Manifesto do app instalável, por banca (nome, cor e logo vêm do hostname). É o que faz o navegador oferecer
 * "instalar". Usa o hostname da requisição, então é sempre gerado na hora (nunca em cache entre bancas).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const ctx = await resolveTenant();
  const tenant = ctx.ok ? ctx.tenant : FALLBACK;
  const { name, primaryColor } = tenant;

  return {
    name,
    short_name: name,
    description: `Aplicativo ${name}`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#EDEDED',
    theme_color: primaryColor,
    icons: [
      { src: pwaIconUrl('192', tenant), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: pwaIconUrl('512', tenant), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: pwaIconUrl('maskable', tenant), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
