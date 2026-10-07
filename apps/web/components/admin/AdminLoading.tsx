/**
 * Esqueleto do conteúdo do painel enquanto a página busca os dados: o menu e a barra superior continuam na tela (são
 * do layout), só a área da página mostra as formas de "filtros + resultados". Leitores de tela ouvem "Carregando…";
 * quem pediu menos movimento no sistema não vê a pulsação.
 */
export default function AdminLoading() {
  const line = 'rounded-md bg-admin-hover motion-safe:animate-pulse';
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">Carregando…</span>
      <div aria-hidden className="rounded-xl border border-admin-border bg-admin-surface p-6">
        <div className={`h-5 w-28 ${line}`} />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className={`h-10 ${line}`} />
          <div className={`h-10 ${line}`} />
          <div className={`h-10 ${line}`} />
        </div>
        <div className={`mt-5 h-9 w-32 ${line}`} />
      </div>
      <div aria-hidden className="rounded-xl border border-admin-border bg-admin-surface p-6">
        <div className={`h-5 w-40 ${line}`} />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 8 }, (_, row) => (
            <div key={row} className={`h-8 ${line}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
