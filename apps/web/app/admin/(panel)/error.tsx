'use client';

/** Falha inesperada em uma página do painel: sem detalhes técnicos, com nova tentativa. */
export default function PanelError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section role="alert" className="rounded-xl bg-admin-surface p-6 shadow-admin">
      <h1 className="text-[16px] font-bold text-admin-text">Algo deu errado</h1>
      <p className="mt-2 text-[13px] text-admin-muted">Não foi possível carregar esta página. Tente novamente.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-admin-accent px-4 py-2 text-[13px] font-semibold text-white"
      >
        Tentar novamente
      </button>
    </section>
  );
}
