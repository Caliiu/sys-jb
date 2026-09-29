import type { DrawSchedule, PublicTenant, PublicUser } from '@sysjb/contracts';
import BalanceCard from '@/components/dashboard/BalanceCard';
import BottomNav from '@/components/dashboard/BottomNav';
import CassinoBanner from '@/components/dashboard/CassinoBanner';
import Footer from '@/components/dashboard/Footer';
import GamesGrid from '@/components/dashboard/GamesGrid';
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
}

/**
 * Dashboard do cliente (layout do App.tsx original). Componente de servidor: só as partes
 * interativas são componentes cliente.
 */
export default function DashboardPage({ tenant, user, drawSchedule, nowIso }: DashboardPageProps) {
  const modalities = DEFAULT_MODALITIES;
  const code = String(user.displayId);

  return (
    <div style={brandStyle(tenant)} className="app-shell bg-[#EDEDED] font-body">
      <InviteProvider inviteCode={user.inviteCode}>
        <TopBar userName={user.name} unitId={code} />

        <main>
          <h1 className="sr-only">Início</h1>
          <BalanceCard initialWallet={user.wallet} />
          <SorteioBanner schedule={drawSchedule} nowIso={nowIso} />
          <PrimaryTiles modalities={modalities} isLoading={false} />
          <UtilityTiles />
          <CassinoBanner modalities={modalities} isLoading={false} />
          <GamesGrid modalities={modalities} isLoading={false} />
          <SupportBanner />
        </main>
        <Footer version={APP_VERSION} />

        <BottomNav />
      </InviteProvider>
    </div>
  );
}
