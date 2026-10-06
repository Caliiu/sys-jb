'use client';

import { formatBrl } from '@/lib/currency';
import type { WithdrawalLimits, WithdrawalSummary } from '@/lib/withdrawal';
import AmountCard from './AmountCard';
import BalanceSummary from './BalanceSummary';
import InfoNotice from './InfoNotice';
import QuickWithdrawAmounts from './QuickWithdrawAmounts';

interface AmountStepProps {
  summary: WithdrawalSummary;
  limits: WithdrawalLimits;
  /** Motivo de não dar para sacar agora (pausado, limite do dia); null = pode. */
  blocker: string | null;
  holderName: string;
  holderDocument: string;
  amountCents: number;
  onChangeAmount: (cents: number) => void;
  onExplain: () => void;
}

/** Etapa 2 do saque: resumo do saldo, valor, valores rápidos e aviso. */
export default function AmountStep({
  summary,
  limits,
  blocker,
  holderName,
  holderDocument,
  amountCents,
  onChangeAmount,
  onExplain,
}: AmountStepProps) {
  return (
    <div className="flex flex-col gap-3 px-3.5 pt-4">
      <BalanceSummary summary={summary} onExplain={onExplain} />
      {blocker && (
        <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800">
          {blocker}
        </p>
      )}
      <AmountCard
        cents={amountCents}
        availableCents={summary.available}
        limits={limits}
        holderName={holderName}
        holderDocument={holderDocument}
        onChange={onChangeAmount}
      />
      <QuickWithdrawAmounts
        amountCents={amountCents}
        availableCents={summary.available}
        limits={limits}
        onSelect={onChangeAmount}
      />
      <InfoNotice>
        O saque só será realizado para conta com o mesmo CPF do cadastro. Por saque: de {formatBrl(limits.minCents)} a{' '}
        {formatBrl(limits.maxCents)}; até {limits.dailyCount} {limits.dailyCount === 1 ? 'saque' : 'saques'} por dia.
      </InfoNotice>
    </div>
  );
}
