import {
  DEFAULT_HOME_LAYOUT,
  type DrawSchedule,
  type HomeBlockId,
  type HomeLayout,
  type PublicMural,
  type PublicTenant,
  type PublicUser,
} from '@sysjb/contracts';
import { Fragment, type ReactNode } from 'react';
import BalanceCard from '@/components/dashboard/BalanceCard';
import BottomNav from '@/components/dashboard/BottomNav';
import CassinoBanner from '@/components/dashboard/CassinoBanner';
import Footer from '@/components/dashboard/Footer';
import GamesGrid from '@/components/dashboard/GamesGrid';
import MuralSheet from '@/components/dashboard/MuralSheet';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import PrimaryTiles from '@/components/dashboard/PrimaryTiles';
import SorteioBanner from '@/components/dashboard/SorteioBanner';
import SupportBanner from '@/components/dashboard/SupportBanner';
import TopBar from '@/components/dashboard/TopBar';
import UtilityTiles from '@/components/dashboard/UtilityTiles';
import { APP_VERSION } from '@/lib/app-version';
import { brandStyle } from '@/lib/brand-style';
import { DEFAULT_MODALITIES } from '@/lib/modalities';

interface DashboardPageProps {
  tenant: PublicTenant;
  user: PublicUser;
  /** Cadastro de sorteios da banca (para o próximo sorteio); null = não foi possível consultar. */
  drawSchedule: DrawSchedule | null;
  /** Momento da renderização (ISO 8601). */
  nowIso: string;
  /** Murais a mostrar ao abrir (vazio = nenhum). */
  murals?: PublicMural[];
  /** Ordem e visibilidade dos blocos e cards (Personalização > Cards do início). Padrão: a do app original. */
  homeLayout?: HomeLayout;
}

/**
 * Dashboard do cliente (layout do App.tsx original). Componente de servidor: só as partes
 * interativas são componentes cliente.
 */
export default function DashboardPage({
  tenant,
  user,
  drawSchedule,
  nowIso,
  murals = [],
  homeLayout = DEFAULT_HOME_LAYOUT,
}: DashboardPageProps) {
  const modalities = DEFAULT_MODALITIES;
  const code = String(user.displayId);
  const cardsOf = (id: HomeBlockId) => homeLayout.blocks.find((block) => block.id === id)?.cards;
  const blocks: Record<HomeBlockId, ReactNode> = {
    draw: <SorteioBanner schedule={drawSchedule} nowIso={nowIso} />,
    primary: <PrimaryTiles modalities={modalities} isLoading={false} cards={cardsOf('primary')} />,
    utility: <UtilityTiles cards={cardsOf('utility')} />,
    casino: <CassinoBanner modalities={modalities} isLoading={false} />,
    games: <GamesGrid modalities={modalities} isLoading={false} cards={cardsOf('games')} />,
    support: <SupportBanner />,
  };

  return (
    <div style={brandStyle(tenant)} className="app-shell bg-[#EDEDED] font-body">
      <InviteProvider inviteCode={user.inviteCode}>
        <TopBar userName={user.name} unitId={code} />

        <main>
          <h1 className="sr-only">Início</h1>
          <BalanceCard initialWallet={user.wallet} />
          {homeLayout.blocks
            .filter((block) => block.visible)
            .map((block) => (
              <Fragment key={block.id}>{blocks[block.id]}</Fragment>
            ))}
        </main>
        <Footer version={APP_VERSION} />

        <BottomNav />
        {murals.length > 0 && <MuralSheet murals={murals} userId={user.id} />}
      </InviteProvider>
    </div>
  );
}
