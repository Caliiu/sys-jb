import { notFound, unauthorized } from 'next/navigation';
import CasinoGameScreen from '@/components/casino/CasinoGameScreen';
import { TenantUnavailable } from '@/components/ui/Notice';
import { launchCasinoGame, parseCasinoGameId } from '@/lib/casino';
import { resolveRequest } from '@/lib/request-context';

export const dynamic = 'force-dynamic';

/**
 * Tela do jogo (visual de IMAGES/Cassino-2.png): abre o jogo no provedor a cada carga (o endereço é de uso único e
 * leva o saldo atual) e mostra dentro de um iframe. A CSP desta rota libera frames https (proxy.ts).
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  const id = parseCasinoGameId((await params).id);
  if (id === null) notFound();

  const result = await launchCasinoGame(ctx.hostname, id);
  if (!result.ok && result.reason === 'SESSION') unauthorized();
  if (!result.ok && result.reason === 'NOT_FOUND') notFound();
  return <CasinoGameScreen launch={result.ok ? result.launch : null} />;
}
