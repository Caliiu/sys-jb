'use client';

import { Calendar } from 'lucide-react';
import { useRef } from 'react';
import { controlClass, labelClass } from './filter-styles';

interface DateFieldProps {
  id: string;
  label: string;
  name: string;
  /** YYYY-MM-DD. */
  defaultValue: string;
  /** Maior data aceita (YYYY-MM-DD). */
  max?: string;
}

/**
 * Campo de data dos filtros: ícone de calendário à esquerda e o calendário do navegador ao clicar em qualquer
 * parte do campo (o indicador nativo fica oculto). O valor enviado é sempre YYYY-MM-DD.
 */
export default function DateField({ id, label, name, defaultValue, max }: DateFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <Calendar
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted"
          aria-hidden
        />
        <input
          ref={ref}
          id={id}
          type="date"
          name={name}
          defaultValue={defaultValue}
          min="2000-01-01"
          max={max}
          required
          onClick={() => {
            // showPicker falha em navegador antigo ou fora de um clique do usuário: o campo segue digitável.
            try {
              ref.current?.showPicker();
            } catch {}
          }}
          className={`${controlClass} pl-11 [&::-webkit-calendar-picker-indicator]:hidden`}
        />
      </div>
    </div>
  );
}
