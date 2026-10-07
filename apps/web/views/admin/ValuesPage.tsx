import type { AdminCommissionSettings } from '@sysjb/contracts';
import ReferralRateForm from '@/components/admin/ReferralRateForm';
import { formatCommission } from '@/lib/admin/commission';

interface ValuesPageProps {
  settings: AdminCommissionSettings;
  /** Pode alterar o percentual. */
  canManage: boolean;
}

const cardClass = 'rounded-xl bg-admin-surface p-5 shadow-admin';

/**
 * Personalização > Valores: o percentual do "Indique e ganhe" (X% da banca), que soma com a comissão de cada promotor
 * sobre o que os indicados apostam. Componente de servidor.
 */
export default function ValuesPage({ settings, canManage }: ValuesPageProps) {
  return (
    <section aria-labelledby="referral-title" className={cardClass}>
      <h2 id="referral-title" className="text-[14px] font-bold text-admin-text">
        Indique e ganhe
      </h2>
      <p className="mt-1 text-[12.5px] text-admin-muted">
        Quem indica um jogador ganha este percentual sobre tudo o que o indicado apostar. Se quem indicou for promotor,
        soma a comissão dele de promotor (ex.: 3% + 7% = 10%). Pago no Saldo quando o pule é apurado (depois do
        resultado).
      </p>
      <div className="mt-4">
        {canManage ? (
          <ReferralRateForm referralCommissionBps={settings.referralCommissionBps} />
        ) : (
          <p className="text-[13.5px] text-admin-text">
            Percentual atual: <strong>{formatCommission(settings.referralCommissionBps)}</strong>
          </p>
        )}
      </div>
    </section>
  );
}
