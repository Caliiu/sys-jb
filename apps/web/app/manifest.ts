import type { MetadataRoute } from 'next';
import { resolveTenant } from '@/lib/request-context';

const FALLBACK = { name: 'Painel do Jogador', primaryColor: '#DF2120' };

/**
 * Manifesto do app instalável, por banca (nome e cor vêm do hostname). É o que faz o navegador oferecer
 * "instalar". Usa o hostname da requisição, então é sempre gerado na hora (nunca em cache entre bancas).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const ctx = await resolveTenant();
  const { name, primaryColor } = ctx.ok ? ctx.tenant : FALLBACK;

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
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
