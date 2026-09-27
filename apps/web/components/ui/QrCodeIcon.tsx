import type { SVGProps } from 'react';

/** Ícone de QR code (traço com `currentColor`: herda a cor do texto, então acompanha a marca da banca). */
export default function QrCodeIcon({ size = 18, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M13 11V7h4v4Zm4 6v-2h-2v2ZM7 13v4h4v-4ZM7 7v2h2V7Z" />
      <path d="M21 8V4a1 1 0 0 0-1-1h-4" />
      <path d="M16 21h4a1 1 0 0 0 1-1v-4" />
      <path d="M8 3H4a1 1 0 0 0-1 1v4" />
      <path d="M3 16v4a1 1 0 0 0 1 1h4" />
    </svg>
  );
}
