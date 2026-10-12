import type { LucideIcon } from 'lucide-react';

/** Aviso de página ainda não construída (item do menu já no lugar). */
export default function ComingSoon({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  return (
    <section
      aria-labelledby="coming-soon-title"
      className="flex flex-col items-center rounded-xl border border-admin-border bg-admin-surface px-6 py-16 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-admin-hover">
        <Icon className="h-6 w-6 text-admin-muted" aria-hidden />
      </span>
      <h1 id="coming-soon-title" className="mt-4 text-[18px] font-semibold text-admin-text">
        {title}
      </h1>
      <span className="mt-2 rounded-md border border-admin-border px-2 py-0.5 text-[12px] font-medium text-admin-muted">
        Em breve
      </span>
      <p className="mt-3 max-w-sm text-[14px] text-admin-muted">
        Esta página está em construção e ficará disponível em uma próxima atualização.
      </p>
    </section>
  );
}
