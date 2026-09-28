import type { DrawSchedule, FazendinhaQuote, PublicTenant, PublicUser } from '@sysjb/contracts';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import FazendinhaScreen from '@/components/fazendinha/FazendinhaScreen';
import { brandStyle } from '@/lib/brand-style';
import type { SoldMap } from '@/lib/fazendinha';

interface FazendinhaPageProps {
  tenant: PublicTenant;
  user: PublicUser;
  /** Instante de referência para o dia/horário das extrações. */
  nowIso: string;
  /** Números já vendidos hoje. */
  initialSold: SoldMap;
  /** Cotação da banca (valores e prêmios). */
  quotes: FazendinhaQuote[];
  /** Cadastro de sorteios da banca. */
  schedule: DrawSchedule;
}

/** Fazendinha: extrações, cotações e palpites, tudo em /fazendinha. Componente de servidor. */
export default function FazendinhaPage({ tenant, user, nowIso, initialSold, quotes, schedule }: FazendinhaPageProps) {
  return (
    <div style={brandStyle(tenant)} className="app-shell bg-[#F4F6F6] font-body">
      <InviteProvider inviteCode={user.inviteCode}>
        <FazendinhaScreen
          nowIso={nowIso}
          wallet={user.wallet}
          initialSold={initialSold}
          quotes={quotes}
          schedule={schedule}
        />
      </InviteProvider>
    </div>
  );
}
