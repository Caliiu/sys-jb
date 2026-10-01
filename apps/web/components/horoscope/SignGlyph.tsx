import type { CSSProperties } from 'react';
import type { ZodiacSign } from '@/lib/horoscope';

/**
 * Medalhão de cada signo (public/signs, desenhos do design), aplicado como máscara: o disco fica na cor do texto
 * (currentColor, ex.: a cor da banca) e a figura é vazada, mostrando o fundo. O SVG é um arquivo estático, fora do
 * bundle, e só o do signo exibido é baixado.
 */
export default function SignGlyph({ sign, className = '' }: { sign: ZodiacSign; className?: string }) {
  const image = `url(/signs/${sign}.svg)`;
  const mask: CSSProperties = {
    maskImage: image,
    maskSize: 'contain',
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskImage: image,
    WebkitMaskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
  };
  return <span aria-hidden className={`inline-block shrink-0 bg-current ${className}`} style={mask} />;
}
