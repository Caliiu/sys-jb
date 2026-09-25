import { useMemo } from 'react';
import { encode } from 'uqr';

interface QrCodeProps {
  value: string;
  size: number;
  className?: string;
  title: string;
}

/**
 * QR code real (escaneável) em SVG. Correção de erro "H" (até 30%): o logo sobreposto no
 * centro não impede a leitura.
 */
export default function QrCode({ value, size, className, title }: QrCodeProps) {
  const { path, modules } = useMemo(() => {
    const qr = encode(value, { ecc: 'H', border: 1 });
    let d = '';
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { path: d, modules: qr.size };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={`0 0 ${modules} ${modules}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={modules} height={modules} fill="#fff" />
      <path d={path} fill="currentColor" />
    </svg>
  );
}
