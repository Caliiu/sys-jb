import { Loader2 } from 'lucide-react';

interface PlayerLoadingProps {
  /** dark: telas de fundo escuro (cassino). */
  tone?: 'light' | 'dark';
}

/**
 * Esqueleto de carregamento do app do jogador: aparece na hora em que uma página é pedida, enquanto o servidor busca
 * os dados (sem ele, a tela anterior ficava parada até a próxima chegar). Só formas neutras na cor da banca, nada de
 * dados, com um círculo girando na cor da banca ao centro. Leitores de tela ouvem "Carregando…"; quem pediu menos
 * movimento no sistema não vê a pulsação nem o giro.
 */
export default function PlayerLoading({ tone = 'light' }: PlayerLoadingProps) {
  const dark = tone === 'dark';
  const block = `rounded-2xl motion-safe:animate-pulse ${dark ? 'bg-white/10' : 'bg-slate-200'}`;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`app-shell relative font-body ${dark ? 'bg-[#14151c]' : 'bg-[#F4F6F6]'}`}
    >
      <span className="sr-only">Carregando…</span>
      <span aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <Loader2 className="h-11 w-11 text-brand-primary motion-safe:animate-spin" />
      </span>
      <div aria-hidden className="bg-brand-primary px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-4">
        <div className="h-5 w-40 rounded-md bg-white/30 motion-safe:animate-pulse" />
        <div className="mt-3 h-9 w-full rounded-xl bg-white/20 motion-safe:animate-pulse" />
      </div>
      <div aria-hidden className="space-y-3 px-3.5 py-4">
        <div className={`h-32 ${block}`} />
        <div className="grid grid-cols-3 gap-3">
          <div className={`h-20 ${block}`} />
          <div className={`h-20 ${block}`} />
          <div className={`h-20 ${block}`} />
        </div>
        <div className={`h-16 ${block}`} />
        <div className={`h-16 ${block}`} />
        <div className={`h-16 ${block}`} />
      </div>
    </div>
  );
}
