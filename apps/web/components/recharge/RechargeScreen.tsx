'use client';

import type { PublicDepositBonusOffers, PublicWallet } from '@sysjb/contracts';
import { useEffect, useState } from 'react';
import type { PixCharge } from '@/lib/recharge';
import { ROUTES } from '@/lib/routes';
import { balanceAmounts } from '@/lib/wallet';
import PaymentDetails from './PaymentDetails';
import RechargeBar from './RechargeBar';
import RechargeForm from './RechargeForm';

interface RechargeScreenProps {
  wallet: PublicWallet;
  /** Titular exibido na etapa de pagamento (o Pix só é aceito desse CPF). */
  holderName: string;
  holderDocument: string;
  /** ID do jogador, no topo junto do nome (como no dashboard). */
  displayId: number;
  /** Bônus de recarga que vale agora (null = sem aviso). */
  bonus?: PublicDepositBonusOffers | null;
}

/**
 * Recarga via Pix em duas etapas na mesma rota (a URL não muda): 1) valor e destino; 2) pagamento.
 * O formulário fica montado (só oculto) durante a etapa 2, para voltar sem perder o que foi digitado.
 * O "ocultar saldo" vale para a barra e para o "Saldo atual".
 */
export default function RechargeScreen({
  wallet: initialWallet,
  holderName,
  holderDocument,
  displayId,
  bonus = null,
}: RechargeScreenProps) {
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [charge, setCharge] = useState<PixCharge | null>(null);
  // Atualizada quando o pagamento é confirmado (o saldo do topo já mostra o crédito).
  const [wallet, setWallet] = useState(initialWallet);
  const balanceCents = balanceAmounts(wallet).main;

  // A etapa nova começa no topo, mesmo que a anterior tenha sido rolada.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [charge]);

  return (
    <>
      <RechargeBar
        title={charge ? 'Efetue o pagamento' : 'Recarga Pix'}
        step={charge ? 2 : 1}
        back={charge ? { onClick: () => setCharge(null) } : { href: ROUTES.home }}
        balanceCents={balanceCents}
        balanceVisible={balanceVisible}
        onToggleBalance={() => setBalanceVisible((v) => !v)}
        userName={holderName}
        displayId={displayId}
      />
      <main>
        <div hidden={charge !== null}>
          <RechargeForm
            onCharge={setCharge}
            balanceCents={balanceCents}
            balanceVisible={balanceVisible}
            bonus={bonus}
          />
        </div>
        {charge && (
          <PaymentDetails
            holderName={holderName}
            holderDocument={holderDocument}
            charge={charge}
            onRestart={() => setCharge(null)}
            onPaid={setWallet}
          />
        )}
      </main>
    </>
  );
}
