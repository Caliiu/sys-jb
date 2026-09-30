import type { ReactNode } from 'react';
import { useId } from 'react';

interface AdminBoxProps {
  /** Título da caixa; sem ele, a caixa não tem cabeçalho (só o conteúdo). */
  title?: string;
  /** Ações à direita do título (ou, sem título, no topo). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Caixa de conteúdo do painel: branca, borda fina, cantos arredondados e sombra leve. */
export default function AdminBox({ title, actions, children, className = '' }: AdminBoxProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className={`rounded-xl border border-admin-border bg-admin-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center gap-3 px-6 pt-5">
          {title && (
            <h2 id={titleId} className="flex-1 text-[17px] font-semibold text-admin-text">
              {title}
            </h2>
          )}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
