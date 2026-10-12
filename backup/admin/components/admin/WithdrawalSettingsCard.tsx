'use client';

import { WITHDRAWAL_LIMITS, type WithdrawalSettings } from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { saveWithdrawalSettingsAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatBrl, formatCents, parseCurrencyInput } from '@/lib/currency';
import AdminBox from './AdminBox';
import { controlClass, labelClass, primaryButtonClass } from './filter-styles';

interface WithdrawalSettingsCardProps {
  settings: WithdrawalSettings;
  /** Gerente (payments.manage): grava. Os outros perfis só consultam. */
  canManage: boolean;
}

type Feedback = { tone: 'success' | 'danger'; text: string } | null;

/** Problema dos limites digitados (o servidor confere de novo), ou null. */
export function withdrawalSettingsProblem(settings: WithdrawalSettings): string | null {
  if (settings.minCents < WITHDRAWAL_LIMITS.minCents) {
    return `O mínimo por saque é de pelo menos ${formatBrl(WITHDRAWAL_LIMITS.minCents)}.`;
  }
  if (settings.maxCents < settings.minCents) return 'O máximo por saque não pode ser menor que o mínimo.';
  if (settings.autoLimitCents > settings.maxCents) return 'O limite automático não pode passar do máximo por saque.';
  if (settings.dailyCount < 1 || settings.dailyCount > WITHDRAWAL_LIMITS.maxDailyCount) {
    return `Saques por dia: de 1 a ${WITHDRAWAL_LIMITS.maxDailyCount}.`;
  }
  return null;
}

/**
 * Configurações > Pagamentos > Saques: liga/pausa os saques e define mínimo, máximo, quantos por dia e até quanto vai
 * direto ao gateway (acima, o Gerente aprova em Carteira > Saques).
 */
export default function WithdrawalSettingsCard({ settings: initial, canManage }: WithdrawalSettingsCardProps) {
  const router = useRouter();
  const ids = { enabled: useId(), min: useId(), max: useId(), daily: useId(), auto: useId() };
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const money = (key: 'minCents' | 'maxCents' | 'autoLimitCents') => (raw: string) => {
    const cents = parseCurrencyInput(raw, WITHDRAWAL_LIMITS.maxCents);
    if (cents !== null) setSettings((current) => ({ ...current, [key]: cents }));
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = withdrawalSettingsProblem(settings);
    if (problem) {
      setFeedback({ tone: 'danger', text: problem });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const result = await saveWithdrawalSettingsAction(settings);
      if (result.ok) {
        setSettings(result.data);
        setFeedback({ tone: 'success', text: 'Limites de saque salvos.' });
      } else if (result.code === 'SESSION_INVALID') router.replace(ADMIN_ROUTES.login);
      else setFeedback({ tone: 'danger', text: result.message });
    } catch {
      setFeedback({ tone: 'danger', text: 'Não foi possível salvar. Tente novamente.' });
    } finally {
      setBusy(false);
    }
  }

  const disabled = !canManage || busy;
  const moneyField = (id: string, label: string, key: 'minCents' | 'maxCents' | 'autoLimitCents', hint: string) => (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-admin-muted">
          R$
        </span>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={formatCents(settings[key])}
          onChange={(event) => money(key)(event.target.value)}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          className={`${controlClass} pl-9 tabular-nums`}
        />
      </div>
      <p id={`${id}-hint`} className="mt-1 text-[12px] text-admin-muted">
        {hint}
      </p>
    </div>
  );

  return (
    <AdminBox title="Saques">
      <form
        onSubmit={(event) => void save(event)}
        noValidate
        aria-label="Limites de saque"
        className="space-y-5 px-6 pt-3 pb-6"
      >
        <label htmlFor={ids.enabled} className="flex items-center gap-2 text-[14px] text-admin-text">
          <input
            id={ids.enabled}
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
            disabled={disabled}
            className="h-4 w-4"
          />
          Saques ligados {!settings.enabled && <span className="text-admin-danger">(pausados: ninguém solicita)</span>}
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          {moneyField(ids.min, 'Mínimo por saque', 'minCents', `A partir de ${formatBrl(WITHDRAWAL_LIMITS.minCents)}.`)}
          {moneyField(ids.max, 'Máximo por saque', 'maxCents', 'Pedidos acima disso são recusados.')}
          {moneyField(
            ids.auto,
            'Aprovação automática até',
            'autoLimitCents',
            'Até este valor o saque vai direto ao gateway; acima, o Gerente aprova em Carteira > Saques. R$ 0,00 = todos passam pela aprovação.',
          )}
          <div>
            <label htmlFor={ids.daily} className={labelClass}>
              Saques por dia (por jogador)
            </label>
            <input
              id={ids.daily}
              type="number"
              min={1}
              max={WITHDRAWAL_LIMITS.maxDailyCount}
              value={settings.dailyCount}
              onChange={(event) =>
                setSettings((current) => ({ ...current, dailyCount: Math.trunc(Number(event.target.value) || 0) }))
              }
              disabled={disabled}
              className={`${controlClass} tabular-nums`}
            />
            <p className="mt-1 text-[12px] text-admin-muted">Cancelados, recusados e não pagos não contam.</p>
          </div>
        </div>

        {feedback && (
          <p
            role={feedback.tone === 'danger' ? 'alert' : 'status'}
            className={`text-[13px] ${feedback.tone === 'danger' ? 'text-admin-danger' : 'text-admin-success'}`}
          >
            {feedback.text}
          </p>
        )}

        {canManage ? (
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? 'Salvando…' : 'Salvar limites'}
          </button>
        ) : (
          <p className="text-[12.5px] text-admin-muted">Só o Gerente altera os limites de saque.</p>
        )}
      </form>
    </AdminBox>
  );
}
