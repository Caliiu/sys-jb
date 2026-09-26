'use client';

import type { WithdrawalSummary } from '@/lib/withdrawal';
import AmountCard from './AmountCard';
import BalanceSummary from './BalanceSummary';
import InfoNotice from './InfoNotice';
import QuickWithdrawAmounts from './QuickWithdrawAmounts';

interface AmountStepProps {
  summary: WithdrawalSummary;
  holderName: string;
  holderDocument: string;
  amountCents: number;
  onChangeAmount: (cents: number) => void;
  onExplain: () => void;
}

/** Etapa 2 do saque: resumo do saldo, valor, valores rápidos e aviso. */
export default function AmountStep({
  summary,
  holderName,
  holderDocument,
  amountCents,
  onChangeAmount,
  onExplain,
}: AmountStepProps) {
  return (
    <div className="flex flex-col gap-3 px-3.5 pt-4">
      <BalanceSummary summary={summary} onExplain={onExplain} />
      <AmountCard
        cents={amountCents}
        availableCents={summary.available}
        holderName={holderName}
        holderDocument={holderDocument}
        onChange={onChangeAmount}
      />
      <QuickWithdrawAmounts amountCents={amountCents} availableCents={summary.available} onSelect={onChangeAmount} />
      <InfoNotice>O saque só será realizado para conta com o mesmo CPF do cadastro.</InfoNotice>
    </div>
  );
}
