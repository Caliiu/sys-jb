'use client';

import { Calendar } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { PERIOD_PRESETS, presetRange } from '@/lib/admin/period';
import { chipClass, controlClass, labelClass } from './filter-styles';

interface PeriodFieldProps {
  label: string;
  /** Nomes dos campos enviados (YYYY-MM-DD). */
  fromName: string;
  toName: string;
  from: string;
  to: string;
  /** Hoje (YYYY-MM-DD, Brasília): base dos atalhos e, sem `max`, a maior data aceita. */
  today: string;
  /** Maior data aceita (ex.: data do jogo, que pode ser futura); padrão: hoje. */
  max?: string;
}

function DateInput({
  name,
  label,
  value,
  min,
  max,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="relative flex-1">
      <Calendar
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted"
        aria-hidden
      />
      <input
        ref={ref}
        type="date"
        name={name}
        aria-label={label}
        value={value}
        min={min}
        max={max}
        required
        onChange={(event) => onChange(event.target.value)}
        onClick={() => {
          // showPicker falha em navegador antigo ou fora de um clique do usuário: o campo segue digitável.
          try {
            ref.current?.showPicker();
          } catch {}
        }}
        className={`${controlClass} pl-10 [&::-webkit-calendar-picker-indicator]:hidden`}
      />
    </div>
  );
}

/**
 * Período dos filtros: atalhos (Ontem, Hoje, 7D, 30D, Mês, Mês Ant.) que preenchem as duas datas, e as datas de início e
 * fim para escolher à mão. O atalho que bate com as datas fica marcado. Os limites (até hoje, início antes do fim) valem
 * no calendário; a API confere de novo.
 */
export default function PeriodField({ label, fromName, toName, from, to, today, max = today }: PeriodFieldProps) {
  const [range, setRange] = useState({ from, to });
  const labelId = useId();

  return (
    <div role="group" aria-labelledby={labelId}>
      <span id={labelId} className={labelClass}>
        {label}
      </span>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PERIOD_PRESETS.map((preset) => {
          const value = presetRange(preset.id, today);
          const active = value.from === range.from && value.to === range.to;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              onClick={() => setRange(value)}
              className={`${chipClass(active)} h-8 px-3`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <DateInput
          name={fromName}
          label="Início do período"
          value={range.from}
          min="2000-01-01"
          max={range.to || max}
          onChange={(value) => setRange((current) => ({ ...current, from: value }))}
        />
        <span className="text-admin-muted" aria-hidden>
          –
        </span>
        <DateInput
          name={toName}
          label="Fim do período"
          value={range.to}
          min={range.from || '2000-01-01'}
          max={max}
          onChange={(value) => setRange((current) => ({ ...current, to: value }))}
        />
      </div>
    </div>
  );
}
