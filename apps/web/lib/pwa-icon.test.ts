// @vitest-environment node
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const apiRequestImage = vi.fn();
vi.mock('./api-client', () => ({ apiRequestImage }));

const { isPwaIconVariant, loadTenantLogo, logoIcon, pwaIconUrl } = await import('./pwa-icon');

/** PNG 40×20 vermelho, sem fundo (logo horizontal). */
const wideLogo = () =>
  sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toBuffer();

beforeEach(() => apiRequestImage.mockReset());

/** Cor principal de uma banca de teste (azul). */
const BRAND = '#1A73E8';
const BRAND_RGB = [26, 115, 232];

describe('ícone do app instalado', () => {
  it('só as variantes do manifesto; a versão da logo e a cor vão no endereço', () => {
    expect(['180', '192', '512', 'maskable'].every(isPwaIconVariant)).toBe(true);
    for (const bad of ['64', '1024', 'constructor', '__proto__', '']) expect(isPwaIconVariant(bad)).toBe(false);
    expect(pwaIconUrl('192', { logoUrl: '/marca/logo?v=mfx1a2', primaryColor: '#1A73E8' })).toBe(
      '/pwa-icon/192?v=mfx1a2-1a73e8',
    );
    expect(pwaIconUrl('maskable', { logoUrl: '/brands/trevo-da-sorte.svg', primaryColor: '#DF2120' })).toBe(
      '/pwa-icon/maskable?v=df2120',
    );
    expect(pwaIconUrl('180', { logoUrl: null, primaryColor: '#DF2120' })).toBe('/pwa-icon/180?v=df2120');
  });

  it('logo padrão em public/ e logo enviada pela API; nada fora disso', async () => {
    expect((await loadTenantLogo('trevo.localhost', '/brands/trevo-da-sorte.svg'))?.toString()).toContain('<svg');

    apiRequestImage.mockResolvedValue({ ok: true, data: new Uint8Array([1, 2, 3]), contentType: 'image/png' });
    expect(await loadTenantLogo('trevo.localhost', '/marca/logo?v=abc')).toEqual(Buffer.from([1, 2, 3]));
    expect(apiRequestImage).toHaveBeenCalledWith('trevo.localhost', '/v1/tenant/logo');

    apiRequestImage.mockResolvedValue({ ok: false });
    expect(await loadTenantLogo('trevo.localhost', '/marca/logo?v=abc')).toBeNull();

    for (const url of [
      null,
      'https://exemplo.com/logo.png',
      '//exemplo.com/logo.png',
      '/../../.env',
      '/brands/../../package.json',
      '/brands/inexistente.png',
      '/brands/trevo-da-sorte.txt',
    ]) {
      expect(await loadTenantLogo('trevo.localhost', url), String(url)).toBeNull();
    }
  });

  it('PNG quadrado no tamanho pedido, fundo opaco na cor da banca e a logo inteira no centro', async () => {
    const png = (await logoIcon(await wideLogo(), '180', BRAND))!;
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.format]).toEqual([180, 180, 'raw']);
    expect((await sharp(png).metadata()).format).toBe('png');
    const pixel = (x: number, y: number) => [
      ...data.subarray((y * 180 + x) * info.channels, (y * 180 + x) * info.channels + 3),
    ];
    expect(pixel(2, 2)).toEqual(BRAND_RGB);
    expect(pixel(90, 90)).toEqual([255, 0, 0]);
    // Logo 2:1 em 72% do lado = 130×65: acima dela, a cor da banca.
    expect(pixel(90, 50)).toEqual(BRAND_RGB);
    expect((await sharp(png).stats()).isOpaque).toBe(true);
  });

  it('maskable deixa a logo menor (área segura do recorte do Android)', async () => {
    const width = async (variant: 'maskable' | '512') => {
      const { data, info } = await sharp((await logoIcon(await wideLogo(), variant, BRAND))!)
        .raw()
        .toBuffer({ resolveWithObject: true });
      let red = 0;
      for (let x = 0; x < info.width; x += 1) if (data[(256 * info.width + x) * info.channels + 1] === 0) red += 1;
      return red;
    };
    expect(await width('maskable')).toBeLessThan(await width('512'));
  });

  it('imagem ilegível ou cor fora de #RRGGBB = null (o ícone usa a inicial)', async () => {
    expect(await logoIcon(Buffer.from('não é imagem'), '192', BRAND)).toBeNull();
    for (const color of ['red', '#fff', '#1a73e8;', 'url(x)'])
      expect(await logoIcon(await wideLogo(), '192', color)).toBeNull();
  });
});
