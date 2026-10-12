'use client';

import { WalletCards } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { payCasinoClosingAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatClosingMonth } from '@/lib/admin/casino-closing-query';
import { formatBrl } from '@/lib/currency';
import ConfirmDialog from './ConfirmDialog';
import { smallButtonClass } from './filter-styles';

interface CasinoClosingPayButtonProps {
  /** YYYY-MM (encerrado). */
  month: string;
  /** Um promotor; sem ele, paga todos os pendentes do mês. */
  promoter?: { id: string; name: string };
  /** O que a tela mostra como a pagar (o valor pago é o que o banco calcula no pagamento). */
  amountCents: number;
  /** Promotores a pagar (no "Pagar Todos"). */
  count?: number;
  disabled?: boolean;
}

/**
 * Pagar a comissão de cassino (um promotor ou todos): pede confirmação (dinheiro) e recarrega a tela depois. A API
 * confere o perfil, o mês e o que falta pagar de novo; um segundo clique ou outra aba não paga duas vezes.
 */
export default function CasinoClosingPayButton({
  month,
  promoter,
  amountCents,
  count = 1,
  disabled = false,
}: CasinoClosingPayButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const label = formatClosingMonth(month);
  const description = promoter
    ? `${formatBrl(amountCents)} de comissão de cassino de ${label} vão para o saldo de saque de ${promoter.name}.`
    : `${formatBrl(amountCents)} de comissão de cassino de ${label} vão para o saldo de saque de ` +
      `${count === 1 ? '1 promotor' : `${count} promotores`}. Promotores bloqueados não recebem.`;

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await payCasinoClosingAction(month, promoter?.id);
      if (result.ok) {
        setOpen(false);
        const { paidCount, paidCents } = result.data;
        setDone(`${formatBrl(paidCents)} pagos a ${paidCount === 1 ? '1 promotor' : `${paidCount} promotores`}.`);
        startTransition(() => router.refresh());
      } else if (result.code === 'SESSION_INVALID') {
        router.replace(ADMIN_ROUTES.login);
      } else {
        setError(result.message);
        // Já pago (outra aba/operador): a tela mostra a situação atual.
        if (result.code === 'CONFLICT') startTransition(() => router.refresh());
      }
    } catch {
      setError('Não foi possível concluir. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setDone(null);
          setOpen(true);
        }}
        disabled={disabled || busy}
        aria-label={promoter ? `Pagar ${promoter.name}` : undefined}
        className={`${smallButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {!promoter && <WalletCards className="h-4 w-4" aria-hidden />}
        {promoter ? 'Pagar' : 'Pagar Todos'}
      </button>
      {done && (
        <span role="status" className="text-[12.5px] font-medium text-admin-success">
          {done}
        </span>
      )}
      <ConfirmDialog
        open={open}
        title={promoter ? 'Pagar comissão de cassino?' : 'Pagar todos os promotores?'}
        description={description}
        confirmLabel="Pagar"
        pending={busy}
        error={error}
        onConfirm={() => void confirm()}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
