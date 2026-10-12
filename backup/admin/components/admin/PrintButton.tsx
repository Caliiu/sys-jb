'use client';

import { Printer } from 'lucide-react';

/** Imprime a página (menu, barra superior e filtros ficam de fora na impressão). */
export default function PrintButton({ className = '' }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      <Printer className="h-3.5 w-3.5" aria-hidden />
      Imprimir
    </button>
  );
}
