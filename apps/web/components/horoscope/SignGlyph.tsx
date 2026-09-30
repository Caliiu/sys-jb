import type { ZodiacSign } from '@/lib/horoscope';

/**
 * Símbolo astrológico de cada signo, em traço (mesmo estilo dos ícones lucide do app). Desenhado em SVG em vez dos
 * caracteres ♈…♓, que muitos celulares mostram como emoji colorido.
 */
const GLYPHS: Record<ZodiacSign, readonly string[]> = {
  aries: ['M12 21V9', 'M12 9c0-5-6-6.5-7.5-3S6 11 8 10', 'M12 9c0-5 6-6.5 7.5-3S18 11 16 10'],
  touro: ['M5 3.5c.5 4.5 3.5 6.5 7 6.5s6.5-2 7-6.5', 'M12 10a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11'],
  gemeos: ['M5 4c4 2 10 2 14 0', 'M5 20c4-2 10-2 14 0', 'M9 5v14', 'M15 5v14'],
  cancer: [
    'M4 10c1-4 6-6 12-5.5c2 .2 3.5 1 4.5 2',
    'M7 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5',
    'M20 14c-1 4-6 6-12 5.5c-2-.2-3.5-1-4.5-2',
    'M17 11.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5',
  ],
  leao: ['M8 11a3 3 0 1 0 0 6a3 3 0 1 0 0-6', 'M11 14c0-7 3-10 6-10s4 3 2.5 6.5S16 16 17 18.5s2.5 2 3.5 1'],
  virgem: [
    'M3.5 7c1-2 3.5-2 3.5 1v11',
    'M7 8c0-3 4-3 4 0v11',
    'M11 8c0-3 4-3 4 0v6c0 3 2 5 4.5 5',
    'M15 13c2-2.5 5-2 4.5 1s-3 4-4.5 5',
  ],
  libra: ['M4 20h16', 'M4 16h4.5c-2-1.5-2.5-3.5-2.5-5a6 6 0 0 1 12 0c0 1.5-.5 3.5-2.5 5H20'],
  escorpiao: [
    'M3.5 7c1-2 3.5-2 3.5 1v11',
    'M7 8c0-3 4-3 4 0v11',
    'M11 8c0-3 4-3 4 0v9c0 1.5 1 2 2.5 2h3',
    'M18.5 17l2 2l-2 2',
  ],
  sagitario: ['M5 19L19 5', 'M11.5 5H19v7.5', 'M7.5 10.5l6 6'],
  capricornio: ['M3.5 5l3.5 11l3.5-11v10c0 4 3 5.5 5.5 5.5s4-1.5 4-3.5s-1.5-3.5-3.5-3.5S13 15 13 17s2 4 5 4'],
  aquario: ['M3 10.5l3-2.5l3 2.5l3-2.5l3 2.5l3-2.5l3 2.5', 'M3 17l3-2.5l3 2.5l3-2.5l3 2.5l3-2.5l3 2.5'],
  peixes: ['M6 3.5c4 4 4 13 0 17', 'M18 3.5c-4 4-4 13 0 17', 'M4.5 12h15'],
};

export default function SignGlyph({ sign, className }: { sign: ZodiacSign; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {GLYPHS[sign].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
