import type { PublicTenant, PublicUser } from '@sysjb/contracts';
import RechargeScreen from '@/components/recharge/RechargeScreen';
import { brandStyle } from '@/lib/brand-style';

interface RechargePageProps {
  tenant: PublicTenant;
  user: PublicUser;
}

/** Recarga via Pix (valor, destino e pagamento, na mesma rota). Componente de servidor. */
export default function RechargePage({ tenant, user }: RechargePageProps) {
  return (
    <div style={brandStyle(tenant)} className="app-shell bg-slate-50 font-body">
      <RechargeScreen wallet={user.wallet} holderName={user.name} holderDocument={user.document} />
    </div>
  );
}
