'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { closeCommissionMonthAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { monthLabel } from '@/lib/admin/commissions-query';
import { formatBrl } from '@/lib/currency';
import ConfirmDialog from './ConfirmDialog';

interface CloseMonthButtonProps {
  month: string;
  /** Total a pagar na prévia (informativo: o valor final é calculado pelo banco no fechamento). */
  paidCents: number;
  beneficiaries: number;
}

/** Fecha o mês e paga as comissões no Saldo (uma vez só: a API e o banco recusam repetição). */
export default function CloseMonthButton({ month, paidCents, beneficiaries }: CloseMonthButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();

  async function close() {
    setPending(true);
    setError(null);
    try {
      const result = await closeCommissionMonthAction(month);
      if (result.ok) {
        setConfirming(false);
        startTransition(() => router.refresh());
      } else if (result.code === 'SESSION_INVALID') {
        router.replace(ADMIN_ROUTES.login);
      } else {
        setError(result.message);
      }
    } catch {
      setError('Não foi possível fechar o mês. Tente novamente.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={refreshing}
        className="h-10 rounded-lg bg-admin-accent px-4 text-[13px] font-semibold text-white active:bg-admin-accent-dark disabled:opacity-60"
      >
        Fechar mês
      </button>
      <ConfirmDialog
        open={confirming}
        title={`Fechar ${monthLabel(month)}?`}
        description={`Serão pagos ${formatBrl(paidCents)} no Saldo de ${beneficiaries} ${
          beneficiaries === 1 ? 'pessoa' : 'pessoas'
        }. Depois de fechado, o mês não pode ser reaberto nem fechado de novo.`}
        confirmLabel="Fechar e pagar"
        pending={pending}
        error={error}
        onConfirm={close}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
