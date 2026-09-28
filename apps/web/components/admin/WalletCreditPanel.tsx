'use client';

import { MAX_WALLET_CREDIT_CENTS, WALLET_CREDIT_BUCKETS, type WalletCreditBucket } from '@sysjb/contracts';
import { Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';
import { creditWalletAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatBrl, formatCents, parseCurrencyInput } from '@/lib/currency';
import ConfirmDialog from './ConfirmDialog';

/** Rótulo do botão e nome da bolsa na confirmação. */
export const CREDIT_BUCKETS: Record<WalletCreditBucket, { action: string; noun: string }> = {
  balance: { action: 'Adicionar Saldo', noun: 'saldo' },
  bonus: { action: 'Adicionar Bônus', noun: 'bônus' },
  games: { action: 'Adicionar Disponível em Games', noun: 'disponível em games' },
};

const inputClass =
  'h-10 w-full rounded-lg border border-admin-border bg-admin-surface px-3 text-[13.5px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';
const labelClass = 'text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted';

interface WalletCreditPanelProps {
  userId: string;
  userName: string;
}

/**
 * "Editar carteira": adiciona saldo, bônus ou disponível em games, com motivo e confirmação. Só aparece
 * para quem tem `wallet.adjust`; a API e o banco conferem de novo. Uma chave por lançamento: reenviar
 * (ex.: após falha de rede) nunca credita duas vezes.
 */
export default function WalletCreditPanel({ userId, userName }: WalletCreditPanelProps) {
  const router = useRouter();
  const amountId = useId();
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [bucket, setBucket] = useState<WalletCreditBucket | null>(null);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const key = useRef<string | null>(null);

  const noteOk = note.trim().length >= 3;
  const ready = bucket !== null && amount > 0 && noteOk;

  /** Qualquer mudança no lançamento pede uma chave nova. */
  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      key.current = null;
      setError(null);
      setter(value);
    };
  }

  function reset() {
    setBucket(null);
    setAmount(0);
    setNote('');
    setError(null);
    key.current = null;
  }

  async function confirm() {
    if (!bucket || pending) return;
    key.current ??= crypto.randomUUID();
    setPending(true);
    setError(null);
    try {
      const result = await creditWalletAction(userId, {
        idempotencyKey: key.current,
        bucket,
        amountCents: amount,
        note: note.trim(),
      });
      if (result.ok) {
        setDone(`${formatBrl(amount)} adicionados em ${CREDIT_BUCKETS[bucket].noun}.`);
        setConfirming(false);
        setOpen(false);
        reset();
        startTransition(() => router.refresh());
      } else if (result.code === 'SESSION_INVALID') {
        router.replace(ADMIN_ROUTES.login);
      } else {
        setError(result.fieldErrors ? Object.values(result.fieldErrors)[0]! : result.message);
      }
    } catch {
      setError('Não foi possível concluir. Tente novamente.');
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
          className="flex h-10 items-center gap-2 rounded-lg border border-admin-border px-4 text-[13px] font-semibold text-admin-text hover:bg-admin-bg"
        >
          <Wallet className="h-4 w-4" aria-hidden />
          Editar carteira
        </button>
        {done && (
          <p role="status" className="text-[13px] font-semibold text-admin-success">
            {done}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="O que adicionar" className="flex flex-wrap gap-2">
        {WALLET_CREDIT_BUCKETS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => change(setBucket)(id)}
            aria-pressed={bucket === id}
            className={`h-10 rounded-lg border px-4 text-[13px] font-semibold ${
              bucket === id
                ? 'border-admin-accent bg-admin-accent text-white'
                : 'border-admin-border text-admin-text hover:bg-admin-bg'
            }`}
          >
            {CREDIT_BUCKETS[id].action}
          </button>
        ))}
      </div>

      {bucket && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) setConfirming(true);
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]"
        >
          <div>
            <label htmlFor={amountId} className={labelClass}>
              Valor (R$)
            </label>
            <input
              id={amountId}
              inputMode="numeric"
              autoComplete="off"
              value={amount === 0 ? '' : formatCents(amount)}
              placeholder="0,00"
              onChange={(event) => {
                const cents = parseCurrencyInput(event.target.value, MAX_WALLET_CREDIT_CENTS);
                if (cents !== null) change(setAmount)(cents);
              }}
              className={`${inputClass} mt-1 tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor={noteId} className={labelClass}>
              Motivo
            </label>
            <input
              id={noteId}
              value={note}
              maxLength={200}
              placeholder="Ex.: bônus de boas-vindas"
              onChange={(event) => change(setNote)(event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={!ready}
              className="h-10 rounded-lg bg-admin-accent px-4 text-[13px] font-semibold text-white active:bg-admin-accent-dark disabled:opacity-50"
            >
              {CREDIT_BUCKETS[bucket].action}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="h-10 rounded-lg border border-admin-border px-4 text-[13px] font-semibold text-admin-text"
            >
              Cancelar
            </button>
          </div>
          <p className="text-[12px] text-admin-muted sm:col-span-2">
            Até {formatBrl(MAX_WALLET_CREDIT_CENTS)} por lançamento. O motivo fica no histórico da carteira.
          </p>
        </form>
      )}

      {bucket && (
        <ConfirmDialog
          open={confirming}
          title="Confirmar crédito"
          description={`Adicionar ${formatBrl(amount)} em ${CREDIT_BUCKETS[bucket].noun} para ${userName}?`}
          confirmLabel="Adicionar"
          pending={pending}
          error={error}
          onConfirm={confirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
