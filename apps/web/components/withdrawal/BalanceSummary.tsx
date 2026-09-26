import { Info } from 'lucide-react';
import { formatBrl } from '@/lib/currency';
import type { WithdrawalSummary } from '@/lib/withdrawal';

interface BalanceSummaryProps {
  summary: WithdrawalSummary;
  /** Abre a explicação "Bônus e recargas não podem ser resgatados". */
  onExplain: () => void;
}

/** Resumo do saldo: total, menos recarga, menos bônus, igual ao disponível para resgate. */
export default function BalanceSummary({ summary, onExplain }: BalanceSummaryProps) {
  return (
    <section aria-labelledby="withdraw-summary-title" className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 id="withdraw-summary-title" className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">
          Resumo do saldo
        </h2>
        <button type="button" onClick={onExplain} className="flex items-center gap-1 text-[12px] text-gray-500">
          <Info className="h-3.5 w-3.5" aria-hidden />
          Entenda
        </button>
      </div>

      <dl className="mt-3 flex flex-col gap-1.5 text-[13px] tabular-nums">
        <div className="flex justify-between">
          <dt className="text-gray-700">Saldo total</dt>
          <dd className="font-bold text-gray-900">{formatBrl(summary.total)}</dd>
        </div>
        <div className="flex justify-between text-gray-400">
          <dt>− Recarga</dt>
          <dd>{formatBrl(summary.recharge)}</dd>
        </div>
        <div className="flex justify-between text-gray-400">
          <dt>− Bônus</dt>
          <dd>{formatBrl(summary.bonus)}</dd>
        </div>
      </dl>

      <div className="mt-3 flex items-end justify-between border-t border-dashed border-gray-300 pt-3">
        <span className="text-[13px] font-semibold text-gray-800">Disponível para resgate</span>
        <span className="text-[20px] font-extrabold leading-none tabular-nums text-gray-900">
          {formatBrl(summary.available)}
        </span>
      </div>
    </section>
  );
}
