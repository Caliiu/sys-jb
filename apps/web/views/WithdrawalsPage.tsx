import type { PublicTenant, PublicUser } from '@sysjb/contracts';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import WithdrawalsScreen from '@/components/withdrawal/WithdrawalsScreen';
import { brandStyle } from '@/lib/brand-style';
import type { WithdrawalItem } from '@/lib/withdrawal';

interface WithdrawalsPageProps {
  tenant: PublicTenant;
  user: PublicUser;
  /** Saques do usuário; vazio enquanto o backend não tiver a solicitação de saque. */
  items?: readonly WithdrawalItem[];
}

/** Saques: lista "Meus saques" e o fluxo "Novo saque", ambos em /saques. Componente de servidor. */
export default function WithdrawalsPage({ tenant, user, items = [] }: WithdrawalsPageProps) {
  return (
    <div style={brandStyle(tenant)} className="app-shell bg-[#F4F6F6] font-body">
      <InviteProvider inviteCode={String(user.displayId)}>
        <WithdrawalsScreen
          userId={user.id}
          items={items}
          wallet={user.wallet}
          holderName={user.name}
          holderDocument={user.document}
          nowIso={new Date().toISOString()}
        />
      </InviteProvider>
    </div>
  );
}
