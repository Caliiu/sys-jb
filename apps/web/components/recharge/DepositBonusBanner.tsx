import { DEPOSIT_BONUS_RULE_LABELS, type PublicDepositBonusOffers, depositBonusFor } from '@sysjb/contracts';
import { Gift } from 'lucide-react';
import { formatBrl } from '@/lib/currency';
import type { RechargeDestination } from '@/lib/recharge';

/** 1000 -> "10%"; 1250 -> "12,5%" (centésimos de %). */
const percent = (bps: number) => `${(bps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

interface DepositBonusBannerProps {
  bonus: PublicDepositBonusOffers;
  amountCents: number;
  destination: RechargeDestination | null;
}

/**
 * Aviso do bônus de recarga de Loterias que vale agora: a melhor oferta e, com o valor digitado, quanto esta recarga
 * ganha (o mesmo cálculo do banco, que é quem concede). Sem oferta, não aparece.
 */
export default function DepositBonusBanner({ bonus, amountCents, destination }: DepositBonusBannerProps) {
  if (bonus.offers.length === 0) return null;
  // A oferta de maior % para o título (o valor exato depende do teto de cada regra).
  const headline = bonus.offers.reduce((best, offer) => (offer.bps > best.bps ? offer : best));
  const preview = depositBonusFor(amountCents, bonus);

  let detail: string;
  if (destination === 'games') detail = 'O bônus vale só para recargas de Loterias.';
  else if (amountCents < bonus.minDepositCents) detail = `Recarregue a partir de ${formatBrl(bonus.minDepositCents)}.`;
  else if (preview) detail = `Nesta recarga você ganha ${formatBrl(preview.amountCents)} de bônus.`;
  else detail = 'Esta recarga não ganha bônus.';

  return (
    <section
      aria-label="Bônus de recarga"
      className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[12.5px] leading-snug text-emerald-900"
    >
      <Gift className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
      <div>
        <p className="text-[13.5px] font-bold">
          {DEPOSIT_BONUS_RULE_LABELS[headline.rule]}: {percent(headline.bps)} de bônus
          <span className="font-semibold"> (até {formatBrl(headline.maxCents)})</span>
        </p>
        <p role="status" className="mt-0.5">
          {detail}
        </p>
        <p className="mt-1 text-[11.5px] text-emerald-800/80">
          Para apostar em Loterias e Fazendinha. O bônus não pode ser sacado; os prêmios ganhos com ele, sim.
        </p>
      </div>
    </section>
  );
}
