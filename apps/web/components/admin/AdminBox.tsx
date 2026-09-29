import type { ReactNode } from 'react';
import { useId } from 'react';

interface AdminBoxProps {
  title: string;
  icon?: ReactNode;
  /** Botões à direita do título. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 'classic' = faixa escura no topo (padrão); 'card' = borda fina, cantos arredondados e sombra suave. */
  variant?: 'classic' | 'card';
}

const VARIANTS = {
  classic: 'rounded-sm border-t-[3px] border-admin-sidebar shadow-admin',
  card: 'overflow-hidden rounded-lg border border-admin-border shadow-[0_1px_2px_rgba(15,23,42,0.06)]',
};

/** Caixa de conteúdo do painel: título (com ações à direita) e corpo branco. */
export default function AdminBox({
  title,
  icon,
  actions,
  children,
  className = '',
  variant = 'classic',
}: AdminBoxProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={`bg-admin-surface ${VARIANTS[variant]} ${className}`}>
      <header className="flex items-center gap-2 border-b border-admin-border px-3 py-2.5">
        {icon}
        <h2 id={titleId} className="flex-1 text-[15.5px] text-admin-text">
          {title}
        </h2>
        {actions}
      </header>
      {children}
    </section>
  );
}
