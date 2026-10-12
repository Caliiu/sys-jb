'use client';

import { DEPOSIT_BONUS_LIMITS, type DepositBonusSettings } from '@sysjb/contracts';
import { Check, CircleHelp, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { saveDepositBonusSettingsAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { commissionInputValue, parseReferralRate } from '@/lib/admin/commission';
import { formatBrl, formatCents, parseCurrencyInput } from '@/lib/currency';
import DepositBonusHowItWorks from './DepositBonusHowItWorks';
import { controlClass, labelClass, outlineButtonClass, primaryButtonClass } from './filter-styles';

interface DepositBonusSettingsCardProps {
  settings: DepositBonusSettings;
  /** Gerente (commissions.manage): grava. Os outros perfis só consultam. */
  canManage: boolean;
}

type RuleKey = 'firstDeposit' | 'daily' | 'federal';
type Rates = Record<RuleKey, string>;
type Feedback = { tone: 'success' | 'danger'; text: string } | null;

/** Regras na ordem da tela, com quando cada uma vale. */
const RULES: ReadonlyArray<{ key: RuleKey; title: string; hint: string }> = [
  { key: 'firstDeposit', title: 'Primeira recarga', hint: 'Válida na primeira recarga da conta.' },
  { key: 'daily', title: 'Primeira recarga diária', hint: 'Válida na primeira recarga de cada dia.' },
  {
    key: 'federal',
    title: 'Recarga em dia de Federal',
    hint: 'Primeira recarga do dia, quando houver sorteio da Federal.',
  },
];

const USAGE = ['Usado primeiro em Loterias e Fazendinha', 'Não pode ser sacado', 'Não expira'];

const cardClass = 'rounded-xl border border-admin-border bg-admin-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
/** Grade das linhas de regra (a mesma do cabeçalho). */
const rowGrid = 'md:grid md:grid-cols-[minmax(0,1fr)_170px_210px_150px] md:items-center md:gap-6';

const ratesOf = (settings: DepositBonusSettings): Rates => ({
  firstDeposit: commissionInputValue(settings.firstDeposit.bps),
  daily: commissionInputValue(settings.daily.bps),
  federal: commissionInputValue(settings.federal.bps),
});

/** Problema do formulário (o servidor confere de novo), ou null. `rates` são os textos de % digitados. */
export function depositBonusProblem(settings: DepositBonusSettings, rates: Rates): string | null {
  if (settings.minDepositCents < DEPOSIT_BONUS_LIMITS.minDepositMinCents) {
    return `A recarga mínima é de pelo menos ${formatBrl(DEPOSIT_BONUS_LIMITS.minDepositMinCents)}.`;
  }
  for (const { key, title } of RULES) {
    const bps = parseReferralRate(rates[key]);
    if (bps === null) return `${title}: % entre 0 e 100, com até 2 casas decimais.`;
    if (settings[key].enabled && bps === 0) return `${title}: informe a % do bônus para ativar.`;
    if (settings[key].enabled && settings[key].maxCents <= 0) return `${title}: informe o limite do bônus.`;
  }
  return null;
}

/**
 * Configurações > Personalização > Bônus de Loterias: % e limite de cada regra, com o interruptor
 * que pausa sem perder os valores, e a recarga mínima. Cada recarga ganha só o maior bônus entre as regras ativas.
 */
export default function DepositBonusSettingsCard({ settings: initial, canManage }: DepositBonusSettingsCardProps) {
  const router = useRouter();
  const baseId = useId();
  const [saved, setSaved] = useState(initial);
  const [settings, setSettings] = useState(initial);
  const [rates, setRates] = useState<Rates>(() => ratesOf(initial));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const disabled = !canManage || busy;
  const activeCount = RULES.filter(({ key }) => settings[key].enabled).length;
  const dirty =
    JSON.stringify(settings) !== JSON.stringify(saved) || JSON.stringify(rates) !== JSON.stringify(ratesOf(saved));

  const setRule = (key: RuleKey, patch: Partial<DepositBonusSettings[RuleKey]>) => {
    setFeedback(null);
    setSettings((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  };

  function discard() {
    setSettings(saved);
    setRates(ratesOf(saved));
    setFeedback(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !dirty) return;
    const problem = depositBonusProblem(settings, rates);
    if (problem) {
      setFeedback({ tone: 'danger', text: problem });
      return;
    }
    const payload: DepositBonusSettings = {
      ...settings,
      firstDeposit: { ...settings.firstDeposit, bps: parseReferralRate(rates.firstDeposit)! },
      daily: { ...settings.daily, bps: parseReferralRate(rates.daily)! },
      federal: { ...settings.federal, bps: parseReferralRate(rates.federal)! },
    };
    setBusy(true);
    setFeedback(null);
    try {
      const result = await saveDepositBonusSettingsAction(payload);
      if (result.ok) {
        setSaved(result.data);
        setSettings(result.data);
        setRates(ratesOf(result.data));
        setFeedback({ tone: 'success', text: 'Alterações salvas.' });
      } else if (result.code === 'SESSION_INVALID') router.replace(ADMIN_ROUTES.login);
      else setFeedback({ tone: 'danger', text: result.message });
    } catch {
      setFeedback({ tone: 'danger', text: 'Não foi possível salvar. Tente novamente.' });
    } finally {
      setBusy(false);
    }
  }

  const moneyInput = (id: string, cents: number, onChange: (cents: number) => void, describedBy?: string) => (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-admin-muted">
        R$
      </span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={formatCents(cents)}
        onChange={(event) => {
          const value = parseCurrencyInput(event.target.value, DEPOSIT_BONUS_LIMITS.maxCapCents);
          if (value !== null) {
            setFeedback(null);
            onChange(value);
          }
        }}
        disabled={disabled}
        aria-describedby={describedBy}
        className={`${controlClass} bg-admin-hover/60 pl-9 tabular-nums`}
      />
    </div>
  );

  return (
    <section aria-labelledby={`${baseId}-title`} className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id={`${baseId}-title`} className="text-[24px] font-bold tracking-tight text-admin-text">
            Bônus de recarga
          </h2>
          <p className="mt-1 text-[14px] text-admin-muted">Gerencie as regras de bônus para recargas de Loterias.</p>
        </div>
        <button type="button" onClick={() => setHelpOpen(true)} className={outlineButtonClass}>
          <CircleHelp className="h-4 w-4" aria-hidden />
          Como funciona
        </button>
      </header>

      <div className="flex gap-3 rounded-xl border border-admin-accent/20 bg-admin-accent/5 px-5 py-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-admin-accent" aria-hidden />
        <div>
          <p className="text-[14px] font-semibold text-admin-accent-dark">Bônus não cumulativos</p>
          <p className="text-[13px] text-admin-muted">Apenas o maior bônus elegível será aplicado em cada recarga.</p>
        </div>
      </div>

      <form onSubmit={(event) => void save(event)} noValidate aria-label="Bônus de recarga" className="space-y-5">
        <div className={`${cardClass} p-5 md:p-6`}>
          <div className="flex items-center gap-3">
            <h3 className="text-[17px] font-semibold text-admin-text">Regras de bônus</h3>
            <span className="rounded-full bg-admin-hover px-2.5 py-0.5 text-[12px] font-medium text-admin-muted">
              {activeCount} de {RULES.length} ativas
            </span>
          </div>

          <div
            aria-hidden
            className={`mt-4 hidden rounded-lg bg-admin-hover px-4 py-3 text-[13px] font-medium text-admin-text ${rowGrid}`}
          >
            <span>Regra</span>
            <span>Bônus (%)</span>
            <span>Limite do bônus</span>
            <span>Status</span>
          </div>

          <div className="divide-y divide-admin-border">
            {RULES.map(({ key, title, hint }) => {
              const id = `${baseId}-${key}`;
              const rule = settings[key];
              return (
                <fieldset key={key} className={`space-y-3 px-1 py-4 md:space-y-0 md:px-4 ${rowGrid}`}>
                  <legend className="sr-only">{title}</legend>
                  <div>
                    <p id={`${id}-name`} className="text-[14.5px] font-medium text-admin-text">
                      {title}
                    </p>
                    <p className="text-[12.5px] text-admin-muted">{hint}</p>
                  </div>
                  <div>
                    <label htmlFor={`${id}-rate`} className={`${labelClass} md:sr-only`}>
                      Bônus (%)
                    </label>
                    <div className="flex">
                      <input
                        id={`${id}-rate`}
                        inputMode="decimal"
                        autoComplete="off"
                        value={rates[key]}
                        onChange={(event) => {
                          setFeedback(null);
                          setRates((current) => ({ ...current, [key]: event.target.value }));
                        }}
                        disabled={disabled}
                        className={`${controlClass} rounded-r-none bg-admin-hover/60 tabular-nums`}
                      />
                      <span
                        aria-hidden
                        className="flex h-10 items-center rounded-r-md border border-l-0 border-admin-border bg-admin-hover/60 px-3 text-[14px] text-admin-muted"
                      >
                        %
                      </span>
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`${id}-max`} className={`${labelClass} md:sr-only`}>
                      Limite do bônus
                    </label>
                    {moneyInput(`${id}-max`, rule.maxCents, (cents) => setRule(key, { maxCents: cents }))}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
                      aria-labelledby={`${id}-name`}
                      onClick={() => setRule(key, { enabled: !rule.enabled })}
                      disabled={disabled}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent focus-visible:ring-offset-2 disabled:opacity-60 ${
                        rule.enabled ? 'bg-admin-success' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          rule.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                    <span
                      className={`text-[13px] ${rule.enabled ? 'font-medium text-admin-success' : 'text-admin-muted'}`}
                    >
                      {rule.enabled ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                </fieldset>
              );
            })}
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className={`${cardClass} p-5 md:p-6`}>
            <h3 className="text-[17px] font-semibold text-admin-text">Configurações gerais</h3>
            <label htmlFor={`${baseId}-min`} className={`${labelClass} mt-4`}>
              Recarga mínima elegível
            </label>
            {moneyInput(
              `${baseId}-min`,
              settings.minDepositCents,
              (cents) => setSettings((current) => ({ ...current, minDepositCents: cents })),
              `${baseId}-min-hint`,
            )}
            <p id={`${baseId}-min-hint`} className="mt-2 text-[12.5px] text-admin-muted">
              Aplica-se a todas as regras de bônus.
            </p>
          </div>

          <div className={`${cardClass} p-5 md:p-6`}>
            <h3 className="text-[17px] font-semibold text-admin-text">Como o bônus é utilizado</h3>
            <ul className="mt-4 space-y-3">
              {USAGE.map((text) => (
                <li key={text} className="flex items-center gap-3 text-[14px] text-admin-text">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-admin-accent/10">
                    <Check className="h-4 w-4 text-admin-accent" aria-hidden />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-admin-border pt-5">
          {feedback && (
            <p
              role={feedback.tone === 'danger' ? 'alert' : 'status'}
              className={`mr-auto text-[13px] ${feedback.tone === 'danger' ? 'text-admin-danger' : 'text-admin-success'}`}
            >
              {feedback.text}
            </p>
          )}
          {canManage ? (
            <>
              <button
                type="button"
                onClick={discard}
                disabled={!dirty || busy}
                className={`${outlineButtonClass} h-10 px-5 disabled:opacity-50`}
              >
                Descartar alterações
              </button>
              <button type="submit" disabled={!dirty || busy} className={`${primaryButtonClass} h-10 px-5`}>
                {busy ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </>
          ) : (
            <p className="text-[12.5px] text-admin-muted">Só o Gerente altera o bônus de recarga.</p>
          )}
        </div>
      </form>

      <DepositBonusHowItWorks open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  );
}
