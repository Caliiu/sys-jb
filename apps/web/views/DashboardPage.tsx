import type { PublicTenant, PublicUser } from '@sysjb/contracts';
import BalanceCard from '@/components/dashboard/BalanceCard';
import BottomNav from '@/components/dashboard/BottomNav';
import CassinoBanner from '@/components/dashboard/CassinoBanner';
import Footer from '@/components/dashboard/Footer';
import GamesGrid from '@/components/dashboard/GamesGrid';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import PrimaryTiles from '@/components/dashboard/PrimaryTiles';
import SorteioBanner, { type NextDraw } from '@/components/dashboard/SorteioBanner';
import SupportBanner from '@/components/dashboard/SupportBanner';
import TopBar from '@/components/dashboard/TopBar';
import UtilityTiles from '@/components/dashboard/UtilityTiles';
import { brandStyle } from '@/lib/brand-style';
import { DEFAULT_MODALITIES } from '@/lib/modalities';

interface DashboardPageProps {
  tenant: PublicTenant;
  user: PublicUser;
  /** Próximo sorteio; null enquanto não houver sorteios cadastrados. */
  nextDraw?: NextDraw | null;
}

/**
 * Dashboard do cliente (layout do App.tsx original). Componente de servidor: só as partes
 * interativas são componentes cliente.
 */
export default function DashboardPage({ tenant, user, nextDraw = null }: DashboardPageProps) {
  const modalities = DEFAULT_MODALITIES;
  const code = String(user.displayId);

  return (
    <div style={brandStyle(tenant)} className="app-shell bg-[#EDEDED] font-body">
      <InviteProvider inviteCode={code}>
        <TopBar userName={user.name} unitId={code} />

        <main>
          <h1 className="sr-only">Início</h1>
          <BalanceCard initialWallet={user.wallet} />
          <SorteioBanner draw={nextDraw} />
          <PrimaryTiles modalities={modalities} isLoading={false} />
          <UtilityTiles />
          <CassinoBanner modalities={modalities} isLoading={false} />
          <GamesGrid modalities={modalities} isLoading={false} />
          <SupportBanner />
        </main>
        <Footer />

        <BottomNav />
      </InviteProvider>
    </div>
  );
}
