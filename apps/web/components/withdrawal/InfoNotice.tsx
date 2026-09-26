import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

/** Aviso informativo (azul) das telas de saque. */
export default function InfoNotice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-[12.5px] leading-snug text-blue-800">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
