import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

/** Voltar para outra página (href) ou para a etapa anterior da própria tela (onClick). */
export type BackAction = { href: string; label?: string } | { onClick: () => void; label?: string };

const className = 'w-9 h-9 flex items-center justify-center shrink-0 active:scale-95 transition-transform';
const icon = <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.5} aria-hidden />;

/** Botão de voltar das barras superiores (seta branca sobre a cor da banca). */
export default function BackButton({ back }: { back: BackAction }) {
  const label = back.label ?? 'Voltar';
  return 'href' in back ? (
    <Link href={back.href} aria-label={label} className={className}>
      {icon}
    </Link>
  ) : (
    <button type="button" onClick={back.onClick} aria-label={label} className={className}>
      {icon}
    </button>
  );
}
