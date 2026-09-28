'use client';

import {
  FAZENDINHA_MODE_CODES,
  FAZENDINHA_MODES,
  FAZENDINHA_STAKES_CENTS,
  MAX_QUOTE_PRIZE_CENTS,
  type PublicQuotes,
} from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { saveFazendinhaQuotesAction, saveTraditionalQuotesAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatBrl, formatCents, parseCurrencyInput } from '@/lib/currency';

const cardClass = 'overflow-hidden rounded-xl bg-admin-surface shadow-admin';
const inputClass =
  'h-9 w-32 rounded-lg border border-admin-border bg-admin-surface px-2 text-right text-[13px] tabular-nums text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';
const thClass = 'px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted';

const fazKey = (mode: string, stakeCents: number) => `${mode}|${stakeCents}`;

/** Campo de prêmio em reais (máscara de moeda: os dígitos entram pelos centavos). */
function PrizeInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (cents: number) => void;
  disabled: boolean;
}) {
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      value={formatCents(value)}
      disabled={disabled}
      onChange={(event) => {
        const cents = parseCurrencyInput(event.target.value, MAX_QUOTE_PRIZE_CENTS);
        if (cents !== null) onChange(cents);
      }}
      className={`${inputClass} ${value === 0 ? 'text-admin-muted' : ''} disabled:border-transparent disabled:bg-transparent`}
    />
  );
}

/** Estado de envio de uma tabela (salvar mostra "salvo" ou o erro). */
function useSave() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();

  async function run(save: () => Promise<{ ok: true } | { ok: false; code: string; message: string }>) {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await save();
      if (result.ok) {
        setMessage({ ok: true, text: 'Cotações salvas.' });
        startTransition(() => router.refresh());
      } else if (result.code === 'SESSION_INVALID') {
        router.replace(ADMIN_ROUTES.login);
      } else {
        setMessage({ ok: false, text: result.message });
      }
    } catch {
      setMessage({ ok: false, text: 'Não foi possível salvar. Tente novamente.' });
    } finally {
      setSaving(false);
    }
  }
  return { saving, message, run };
}

function SaveBar({
  saving,
  message,
  dirty,
}: {
  saving: boolean;
  message: { ok: boolean; text: string } | null;
  dirty: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-admin-border px-4 py-3">
      <button
        type="submit"
        disabled={saving || !dirty}
        className="h-10 rounded-lg bg-admin-accent px-4 text-[13px] font-semibold text-white active:bg-admin-accent-dark disabled:opacity-50"
      >
        {saving ? 'Salvando…' : 'Salvar'}
      </button>
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={`text-[12.5px] font-semibold ${message.ok ? 'text-admin-success' : 'text-admin-danger'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/**
 * Tabelas de cotação da banca. Prêmio R$ 0,00 desliga a modalidade (ou o valor, na Fazendinha). Salvar
 * envia só os itens alterados, para não desfazer o que outro gerente salvou; a API audita o que mudou.
 */
export default function QuotesEditor({ quotes, canManage }: { quotes: PublicQuotes; canManage: boolean }) {
  const [traditional, setTraditional] = useState(() =>
    Object.fromEntries(quotes.traditional.map((q) => [q.modality, q.prizeCents])),
  );
  const [fazendinha, setFazendinha] = useState(() =>
    Object.fromEntries(quotes.fazendinha.map((q) => [fazKey(q.mode, q.stakeCents), q.prizeCents])),
  );
  const traditionalSave = useSave();
  const fazendinhaSave = useSave();

  const traditionalDirty = quotes.traditional.some((q) => traditional[q.modality] !== q.prizeCents);
  const fazendinhaDirty = quotes.fazendinha.some((q) => fazendinha[fazKey(q.mode, q.stakeCents)] !== q.prizeCents);

  function submitTraditional(event: FormEvent) {
    event.preventDefault();
    void traditionalSave.run(() =>
      saveTraditionalQuotesAction({
        // Só o que foi alterado: não desfaz o que outro gerente salvou nesse meio-tempo.
        quotes: quotes.traditional
          .filter((q) => traditional[q.modality] !== q.prizeCents)
          .map((q) => ({ modality: q.modality, prizeCents: traditional[q.modality]! })),
      }),
    );
  }

  function submitFazendinha(event: FormEvent) {
    event.preventDefault();
    void fazendinhaSave.run(() =>
      saveFazendinhaQuotesAction({
        quotes: quotes.fazendinha
          .filter((q) => fazendinha[fazKey(q.mode, q.stakeCents)] !== q.prizeCents)
          .map((q) => ({
            mode: q.mode,
            stakeCents: q.stakeCents,
            prizeCents: fazendinha[fazKey(q.mode, q.stakeCents)]!,
          })),
      }),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submitTraditional} aria-labelledby="quotes-traditional" className={cardClass}>
        <div className="p-5 pb-3">
          <h2 id="quotes-traditional" className="text-[14px] font-bold text-admin-text">
            Tradicional
          </h2>
          <p className="mt-1 text-[12.5px] text-admin-muted">
            Prêmio para cada R$ 1,00 apostado. Tabela atual: <strong>{quotes.tableLabel}</strong> (centena/1/milhar).
          </p>
        </div>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-y border-admin-border">
              <th scope="col" className={thClass}>
                Modalidade
              </th>
              <th scope="col" className={`${thClass} text-right`}>
                Prêmio (R$)
              </th>
            </tr>
          </thead>
          <tbody>
            {quotes.traditional.map((q) => (
              <tr key={q.modality} className="border-b border-admin-border last:border-0">
                <th scope="row" className="px-4 py-2 font-medium text-admin-text">
                  {q.label}
                </th>
                <td className="px-4 py-2 text-right">
                  <PrizeInput
                    label={`Prêmio ${q.label}`}
                    value={traditional[q.modality]!}
                    disabled={!canManage}
                    onChange={(cents) => setTraditional((cur) => ({ ...cur, [q.modality]: cents }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {canManage && <SaveBar {...traditionalSave} dirty={traditionalDirty} />}
      </form>

      <form onSubmit={submitFazendinha} aria-labelledby="quotes-fazendinha" className={cardClass}>
        <div className="p-5 pb-3">
          <h2 id="quotes-fazendinha" className="text-[14px] font-bold text-admin-text">
            Fazendinha
          </h2>
          <p className="mt-1 text-[12.5px] text-admin-muted">
            Prêmio de cada número por valor de aposta. R$ 0,00 = o valor não é oferecido naquela modalidade.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-y border-admin-border">
                <th scope="col" className={thClass}>
                  Valor da aposta
                </th>
                {FAZENDINHA_MODES.map((mode) => (
                  <th key={mode.id} scope="col" className={`${thClass} text-right`}>
                    {mode.label} ({FAZENDINHA_MODE_CODES[mode.id]})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FAZENDINHA_STAKES_CENTS.map((stake) => (
                <tr key={stake} className="border-b border-admin-border last:border-0">
                  <th scope="row" className="px-4 py-2 font-medium tabular-nums text-admin-text">
                    {formatBrl(stake)}
                  </th>
                  {FAZENDINHA_MODES.map((mode) => (
                    <td key={mode.id} className="px-4 py-2 text-right">
                      <PrizeInput
                        label={`Prêmio ${FAZENDINHA_MODE_CODES[mode.id]}-${stake / 100}`}
                        value={fazendinha[fazKey(mode.id, stake)] ?? 0}
                        disabled={!canManage}
                        onChange={(cents) => setFazendinha((cur) => ({ ...cur, [fazKey(mode.id, stake)]: cents }))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManage && <SaveBar {...fazendinhaSave} dirty={fazendinhaDirty} />}
      </form>
    </div>
  );
}
