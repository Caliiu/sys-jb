import { unauthorized } from 'next/navigation';
import HowToPlayScreen from '@/components/help/HowToPlayScreen';
import PlayerShell from '@/components/section/PlayerShell';
import { TenantUnavailable } from '@/components/ui/Notice';
import { HOW_TO_PLAY_TOPICS } from '@/lib/how-to-play';
import { resolveRequest } from '@/lib/request-context';

export const dynamic = 'force-dynamic';

/** Menu > Como jogar: guia das apostas e das telas do app (conteúdo em lib/how-to-play.ts). */
export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  return (
    <PlayerShell tenant={ctx.tenant} inviteCode={ctx.me.inviteCode}>
      <HowToPlayScreen topics={HOW_TO_PLAY_TOPICS} />
    </PlayerShell>
  );
}
