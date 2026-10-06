import type { PublicTenant, PublicUser } from '@sysjb/contracts';
import { InviteProvider } from '@/components/dashboard/InviteProvider';
import WithdrawalsScreen from '@/components/withdrawal/WithdrawalsScreen';
import { brandStyle } from '@/lib/brand-style';
import { DEFAULT_WITHDRAWAL_LIMITS, type WithdrawalItem, type WithdrawalLimits } from '@/lib/withdrawal';

interface WithdrawalsPageProps {
  tenant: PublicTenant;
  user: PublicUser;
  /** Saques do usuário (os mais recentes). */
  items?: readonly WithdrawalItem[];
  /** Limites de saque da banca e o uso de hoje (padrão da banca quando não lidos). */
  limits?: WithdrawalLimits;
  /** Não foi possível ler os saques: a tela avisa em vez de dizer que não há nenhum. */
  loadFailed?: boolean;
}

/** Saques: lista "Meus saques" e o fluxo "Novo saque", ambos em /saques. Componente de servidor. */
export default function WithdrawalsPage({
  tenant,
  user,
  items = [],
  limits = DEFAULT_WITHDRAWAL_LIMITS,
  loadFailed = false,
}: WithdrawalsPageProps) {
  return (
    <div style={brandStyle(tenant)} className="app-shell bg-[#F4F6F6] font-body">
      <InviteProvider inviteCode={user.inviteCode}>
        <WithdrawalsScreen
          userId={user.id}
          items={items}
          limits={limits}
          loadFailed={loadFailed}
          wallet={user.wallet}
          holderName={user.name}
          holderDocument={user.document}
          nowIso={new Date().toISOString()}
        />
      </InviteProvider>
    </div>
  );
}
