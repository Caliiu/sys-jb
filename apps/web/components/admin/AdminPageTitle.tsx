/**
 * Título da página do painel. Na tela, quem mostra onde se está é a trilha da barra superior; o h1 fica só para
 * leitores de tela e para a aba.
 */
export default function AdminPageTitle({ title }: { title: string }) {
  return <h1 className="sr-only">{title}</h1>;
}
