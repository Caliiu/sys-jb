import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

/**
 * Endereço antigo (escolha das extrações de um dia): os resultados ficam numa rota só. Leva para ela, já nas extrações
 * do dia (data inválida ou fora do período: a própria tela abre na escolha do dia).
 */
export default async function Page({ params }: { params: Promise<{ data: string }> }) {
  const { data: date } = await params;
  redirect(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${ROUTES.lotteryResults}?data=${date}` : ROUTES.lotteryResults);
}
