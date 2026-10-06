'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { reviewDepositAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatBrl } from '@/lib/currency';
import { smallButtonClass } from './filter-styles';

interface DepositReviewActionsProps {
  depositId: string;
  amountCents: number;
  playerName: string;
}

/**
 * Depósito em análise (pago por outro titular): o Gerente libera o crédito ou recusa. Pede confirmação (dinheiro) e
 * recarrega a lista depois. A API confere o perfil de novo e audita.
 */
export default function DepositReviewActions({ depositId, amountCents, playerName }: DepositReviewActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function decide(approve: boolean) {
    if (busy) return;
    const question = approve
      ? `Liberar ${formatBrl(amountCents)} na carteira de ${playerName}? O Pix veio de outra conta.`
      : `Recusar o depósito de ${formatBrl(amountCents)}? Nada é creditado; a devolução ao pagador é feita fora do sistema.`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await reviewDepositAction(depositId, approve);
      if (result.ok) startTransition(() => router.refresh());
      else if (result.code === 'SESSION_INVALID') router.replace(ADMIN_ROUTES.login);
      else setError(result.message);
    } catch {
      setError('Não foi possível concluir. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => void decide(true)} disabled={busy} className={smallButtonClass}>
        Liberar crédito
      </button>
      <button
        type="button"
        onClick={() => void decide(false)}
        disabled={busy}
        className={`${smallButtonClass} text-admin-danger`}
      >
        Recusar
      </button>
      {error && (
        <p role="alert" className="w-full text-[12px] text-admin-danger">
          {error}
        </p>
      )}
    </div>
  );
}
