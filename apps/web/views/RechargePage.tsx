import type { PublicDepositBonusOffers, PublicTenant, PublicUser } from '@sysjb/contracts';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import RechargeScreen from '@/components/recharge/RechargeScreen';
import { brandStyle } from '@/lib/brand-style';

interface RechargePageProps {
  tenant: PublicTenant;
  user: PublicUser;
  /** Bônus de recarga que vale agora; null = não foi possível ler (a tela segue sem o aviso). */
  bonus?: PublicDepositBonusOffers | null;
}

/** Recarga via Pix (valor, destino e pagamento, na mesma rota). Componente de servidor. */
export default function RechargePage({ tenant, user, bonus = null }: RechargePageProps) {
  return (
    <div style={brandStyle(tenant)} className="app-shell bg-slate-50 font-body">
      <InviteProvider inviteCode={user.inviteCode}>
        <RechargeScreen
          wallet={user.wallet}
          holderName={user.name}
          holderDocument={user.document}
          displayId={user.displayId}
          bonus={bonus}
        />
      </InviteProvider>
    </div>
  );
}
