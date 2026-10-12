'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState, useTransition } from 'react';
import { setReferralRateAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { REFERRAL_RATE_HELP, commissionInputValue, parseReferralRate } from '@/lib/admin/commission';

const inputClass =
  'h-10 w-32 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13.5px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';

/** Altera a % do "Indique e ganhe" (vale para os próximos fechamentos; meses fechados não mudam). */
export default function ReferralRateForm({ referralCommissionBps }: { referralCommissionBps: number }) {
  const router = useRouter();
  const inputId = useId();
  const [value, setValue] = useState(commissionInputValue(referralCommissionBps));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const bps = parseReferralRate(value);
    if (bps === null) return setError(REFERRAL_RATE_HELP);
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const result = await setReferralRateAction(bps);
      if (result.ok) {
        setValue(commissionInputValue(result.data.referralCommissionBps));
        setSaved(true);
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

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor={inputId} className="text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted">
          Percentual (%)
        </label>
        <input
          id={inputId}
          inputMode="decimal"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
          aria-invalid={error ? true : undefined}
          className={`${inputClass} mt-1 block tabular-nums`}
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="h-10 rounded-lg bg-admin-accent px-4 text-[13px] font-semibold text-white active:bg-admin-accent-dark disabled:opacity-60"
      >
        {saving ? 'Salvando…' : 'Salvar'}
      </button>
      {error && (
        <p role="alert" className="w-full text-[12.5px] font-semibold text-admin-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="w-full text-[12.5px] font-semibold text-admin-success">
          Percentual salvo.
        </p>
      )}
    </form>
  );
}
