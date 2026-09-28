'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState, useTransition } from 'react';
import { removePromoterAction, setPromoterAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { COMMISSION_HELP, commissionInputValue, formatCommission, parseCommission } from '@/lib/admin/commission';
import ConfirmDialog from './ConfirmDialog';

interface PromoterControlsProps {
  userId: string;
  /** Comissão atual em centésimos de %; null = ainda não é promotor. */
  commissionBps: number | null;
  /** O que fazer depois de remover: recarregar a página ou voltar para a lista de promotores. */
  afterRemove?: 'refresh' | 'list';
}

const inputClass =
  'h-10 w-32 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13.5px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';

/**
 * Promover a promotor, alterar a comissão ou remover. Só aparece para quem pode gerenciar promotores
 * (a API confere a permissão de novo a cada chamada).
 */
export default function PromoterControls({ userId, commissionBps, afterRemove = 'refresh' }: PromoterControlsProps) {
  const router = useRouter();
  const inputId = useId();
  const isPromoter = commissionBps !== null;
  const [value, setValue] = useState(isPromoter ? commissionInputValue(commissionBps) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();
  const busy = saving || refreshing;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const bps = parseCommission(value);
    if (bps === null) return setError(COMMISSION_HELP);
    if (bps === commissionBps) return setError(null);

    setError(null);
    setSaving(true);
    try {
      const result = await setPromoterAction(userId, bps);
      if (result.ok) {
        setValue(commissionInputValue(result.data.commissionBps));
        startTransition(() => router.refresh());
      } else if (result.code === 'SESSION_INVALID') {
        router.replace(ADMIN_ROUTES.login);
      } else {
        setError(result.message);
      }
    } catch {
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setRemovalError(null);
    try {
      const result = await removePromoterAction(userId);
      if (result.ok) {
        setConfirmingRemoval(false);
        if (afterRemove === 'list') router.replace(ADMIN_ROUTES.promoters);
        else startTransition(() => router.refresh());
      } else if (result.code === 'SESSION_INVALID') {
        router.replace(ADMIN_ROUTES.login);
      } else {
        setRemovalError(result.message);
      }
    } catch {
      setRemovalError('Não foi possível concluir. Tente novamente.');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={inputId} className="text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted">
            Comissão (%)
          </label>
          <input
            id={inputId}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            inputMode="decimal"
            autoComplete="off"
            maxLength={7}
            placeholder="Ex.: 10"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className={`mt-1 block ${inputClass}`}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="h-10 rounded-lg bg-admin-accent px-4 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Salvando…' : isPromoter ? 'Salvar comissão' : 'Tornar promotor'}
        </button>
        {isPromoter && (
          <button
            type="button"
            onClick={() => setConfirmingRemoval(true)}
            className="h-10 rounded-lg bg-admin-danger/10 px-4 text-[13px] font-semibold text-admin-danger"
          >
            Remover promotor
          </button>
        )}
        {error && (
          <p id={`${inputId}-error`} role="alert" className="w-full text-[12.5px] font-semibold text-admin-danger">
            {error}
          </p>
        )}
      </form>

      <ConfirmDialog
        open={confirmingRemoval}
        title="Remover promotor"
        description={`Este usuário deixa de ser promotor (comissão de ${
          isPromoter ? formatCommission(commissionBps) : ''
        }). Os jogadores indicados por ele continuam vinculados, e o link de convite continua valendo, mas daqui em diante ele ganha só a % de indicação.`}
        confirmLabel="Remover"
        tone="danger"
        pending={removing || refreshing}
        error={removalError}
        onConfirm={handleRemove}
        onCancel={() => {
          setConfirmingRemoval(false);
          setRemovalError(null);
        }}
      />
    </>
  );
}
