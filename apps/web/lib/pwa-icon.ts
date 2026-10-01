import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { apiRequestImage } from './api-client';

/**
 * Variantes do ícone do app instalado: 180 (iPhone, apple-touch-icon), 192 e 512 (manifesto) e "maskable" (512, o
 * Android recorta em círculo/gota: a logo fica menor, dentro da área segura de 80%). Qualquer outra é 404.
 */
export const PWA_ICON_VARIANTS = {
  '180': { size: 180, logoScale: 0.72 },
  '192': { size: 192, logoScale: 0.72 },
  '512': { size: 512, logoScale: 0.72 },
  maskable: { size: 512, logoScale: 0.56 },
} as const;
export type PwaIconVariant = keyof typeof PWA_ICON_VARIANTS;

export const isPwaIconVariant = (value: string): value is PwaIconVariant => Object.hasOwn(PWA_ICON_VARIANTS, value);

/**
 * Endereço do ícone. A versão (?v=) junta a da logo e a cor da banca: trocar uma ou outra no painel muda o endereço,
 * e o celular busca o ícone novo em vez de usar o do cache.
 */
export function pwaIconUrl(variant: PwaIconVariant, tenant: { logoUrl: string | null; primaryColor: string }): string {
  const logoVersion = tenant.logoUrl ? (/[?&]v=([a-z0-9]{1,16})$/i.exec(tenant.logoUrl)?.[1] ?? '') : '';
  const color = tenant.primaryColor.replace('#', '').toLowerCase();
  return `/pwa-icon/${variant}?v=${logoVersion ? `${logoVersion}-` : ''}${color}`;
}

/** Logo padrão da banca em public/ (ex.: /brands/trevo-da-sorte.svg): só esse formato de caminho, sem subir pastas. */
const PUBLIC_LOGO = /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:svg|png|jpe?g|webp)$/;

/** Logo enviada pelo painel (servida pelo web em /marca/logo?v=...). */
const UPLOADED_LOGO = /^\/marca\/logo(?:\?v=[a-z0-9]{1,16})?$/i;

/** Maior logo lida (a enviada pelo painel tem até 1 MB). */
const MAX_LOGO_BYTES = 2_000_000;

/**
 * Bytes da logo da banca: a enviada pelo painel (pela API) ou a padrão em public/. Endereço externo ou fora desses
 * formatos = null (nunca busca URL arbitrária). Falha de leitura também = null: o ícone usa a inicial.
 */
export async function loadTenantLogo(hostname: string, logoUrl: string | null): Promise<Buffer | null> {
  if (!logoUrl) return null;
  if (UPLOADED_LOGO.test(logoUrl)) {
    const logo = await apiRequestImage(hostname, '/v1/tenant/logo');
    return logo.ok && logo.data.length <= MAX_LOGO_BYTES ? Buffer.from(logo.data) : null;
  }
  if (!PUBLIC_LOGO.test(logoUrl)) return null;
  const publicDir = path.join(process.cwd(), 'public');
  const file = path.join(publicDir, logoUrl);
  if (!file.startsWith(publicDir + path.sep)) return null;
  try {
    const data = await readFile(file);
    return data.length <= MAX_LOGO_BYTES ? data : null;
  } catch {
    return null;
  }
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Ícone quadrado em PNG: a logo inteira (sem cortar, proporção mantida) centralizada sobre a cor principal da banca
 * (a do tema). Fundo opaco de propósito: o iPhone pinta de preto o que é transparente. null = a imagem não pôde ser
 * lida ou a cor não é #RRGGBB.
 */
export async function logoIcon(logo: Buffer, variant: PwaIconVariant, background: string): Promise<Buffer | null> {
  if (!HEX_COLOR.test(background)) return null;
  const { size, logoScale } = PWA_ICON_VARIANTS[variant];
  const inner = Math.round(size * logoScale);
  try {
    // limitInputPixels: recusa imagem gigante (bomba de descompressão); density: SVG nítido no tamanho grande.
    const resized = await sharp(logo, { limitInputPixels: 40_000_000, density: 300 })
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return await sharp({ create: { width: size, height: size, channels: 4, background } })
      .composite([{ input: resized, gravity: 'center' }])
      .flatten({ background })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
