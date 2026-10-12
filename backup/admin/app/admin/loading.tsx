/** Carregamento fora do painel logado (tela de login): só um aviso discreto, sem o esqueleto do app do jogador. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="grid min-h-screen place-items-center bg-admin-bg">
      <span className="text-[13px] text-admin-muted motion-safe:animate-pulse">Carregando…</span>
    </div>
  );
}
