'use client';

import { WITHDRAWAL_LIMITS } from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { resolveWithdrawalAction, reviewWithdrawalAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatBrl } from '@/lib/currency';
import { smallButtonClass } from './filter-styles';

interface WithdrawalActionsProps {
  withdrawalId: string;
  amountCents: number;
  playerName: string;
  /** 'review': aprovar ou recusar (em análise); 'resolve': concluir à mão um envio sem resposta. */
  mode: 'review' | 'resolve';
  /** Id da transação no gateway, para conferir lá antes de concluir. */
  providerTransactionId?: string | null;
}

/**
 * Ações do Gerente num saque. Pedem confirmação (dinheiro) e recarregam a lista depois; a API confere o perfil e a
 * situação de novo e audita. Concluir à mão é só depois de conferir no painel do gateway: marcar "não pago" um saque
 * que foi pago devolve o valor e paga duas vezes.
 */
export default function WithdrawalActions({
  withdrawalId,
  amountCents,
  playerName,
  mode,
  providerTransactionId = null,
}: WithdrawalActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function run(action: () => ReturnType<typeof reviewWithdrawalAction>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.ok) startTransition(() => router.refresh());
      else if (result.code === 'SESSION_INVALID') router.replace(ADMIN_ROUTES.login);
      else setError(result.message);
    } catch {
      setError('Não foi possível concluir. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  function approve() {
    if (busy) return;
    if (
      !window.confirm(`Aprovar o saque de ${formatBrl(amountCents)} de ${playerName}? Ele vai para o gateway agora.`)
    ) {
      return;
    }
    void run(() => reviewWithdrawalAction(withdrawalId, true));
  }

  function reject() {
    if (busy) return;
    const note = window.prompt(
      `Recusar o saque de ${formatBrl(amountCents)}? O valor volta para os prêmios de ${playerName}.\n` +
        `Motivo para o jogador (opcional, ${WITHDRAWAL_LIMITS.noteMin} a ${WITHDRAWAL_LIMITS.noteMax} caracteres):`,
      '',
    );
    if (note === null) return;
    const trimmed = note.trim();
    if (trimmed && (trimmed.length < WITHDRAWAL_LIMITS.noteMin || trimmed.length > WITHDRAWAL_LIMITS.noteMax)) {
      setError(`O motivo deve ter de ${WITHDRAWAL_LIMITS.noteMin} a ${WITHDRAWAL_LIMITS.noteMax} caracteres.`);
      return;
    }
    void run(() => reviewWithdrawalAction(withdrawalId, false, trimmed || undefined));
  }

  function resolve(paid: boolean) {
    if (busy) return;
    const reference = providerTransactionId ? ` (transação ${providerTransactionId})` : '';
    const question = paid
      ? `Confirmar que o saque de ${formatBrl(amountCents)}${reference} FOI PAGO no gateway? Ele será concluído como pago.`
      : `Confirmar que o saque de ${formatBrl(amountCents)}${reference} NÃO FOI PAGO no gateway? O valor volta para ` +
        `os prêmios de ${playerName}. Se ele tiver sido pago, o jogador recebe duas vezes.`;
    if (!window.confirm(question)) return;
    void run(() => resolveWithdrawalAction(withdrawalId, paid));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {mode === 'review' ? (
        <>
          <button type="button" onClick={approve} disabled={busy} className={smallButtonClass}>
            Aprovar
          </button>
          <button type="button" onClick={reject} disabled={busy} className={`${smallButtonClass} text-admin-danger`}>
            Recusar
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => resolve(true)} disabled={busy} className={smallButtonClass}>
            Foi pago
          </button>
          <button
            type="button"
            onClick={() => resolve(false)}
            disabled={busy}
            className={`${smallButtonClass} text-admin-danger`}
          >
            Não foi pago
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="w-full text-[12px] text-admin-danger">
          {error}
        </p>
      )}
    </div>
  );
}
