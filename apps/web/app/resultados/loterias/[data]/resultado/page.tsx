import { resultsViewPath } from '@sysjb/contracts';
import { redirect } from 'next/navigation';
import { parseResultDrawIds, ROUTES } from '@/lib/routes';

/**
 * Endereço antigo do resultado (`/resultados/loterias/:data/resultado?sorteios=`), usado pelas notificações já
 * enviadas: leva à rota única, que abre direto no resultado e deixa o endereço só como /resultados/loterias.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ data: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { data: date } = await params;
  const ids = parseResultDrawIds((await searchParams).sorteios);
  redirect(/^\d{4}-\d{2}-\d{2}$/.test(date) && ids.length > 0 ? resultsViewPath(date, ids) : ROUTES.lotteryResults);
}
