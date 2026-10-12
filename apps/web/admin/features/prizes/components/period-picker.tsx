'use client';

import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { ptBR } from 'react-day-picker/locale';
import { useIsMobile } from '@/admin/hooks/use-mobile';
import { Button } from '@/admin/components/ui/button';
import { Calendar } from '@/admin/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/admin/components/ui/popover';
import { PERIOD_PRESETS, presetRange } from '@/lib/admin/period';
import { periodText } from '@/lib/admin/prizes-format';

/** Período em datas de calendário (YYYY-MM-DD); `to` vazio enquanto o operador escolhe o fim. */
export interface PeriodValue {
  from: string;
  to: string;
}

type PeriodPickerProps = {
  id?: string;
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  /** Hoje (YYYY-MM-DD, Brasília): maior data escolhível e base dos atalhos. */
  today: string;
  invalid?: boolean;
};

/** "YYYY-MM-DD" -> Date local (meia-noite), como o calendário trabalha. */
const toDate = (day: string) => new Date(`${day}T00:00:00`);
const toDay = (date: Date) => format(date, 'yyyy-MM-dd');

/** Período (de/até) no estilo do seletor de data do template, com atalhos ao lado do calendário. */
export function PeriodPicker({ id, value, onChange, today, invalid }: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  // Celular: um mês só. O popover só abre no navegador, então não há diferença na hidratação.
  const isMobile = useIsMobile();
  const months = isMobile ? 1 : 2;
  // O mês do fim do período (ou de hoje) fica à direita: abre no mês anterior a ele quando são dois.
  const end = toDate(value.to || value.from || today);
  const firstMonth = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
  const selected: DateRange | undefined = value.from
    ? { from: toDate(value.from), to: value.to ? toDate(value.to) : undefined }
    : undefined;
  const activePreset = PERIOD_PRESETS.find((preset) => {
    const range = presetRange(preset.id, today);
    return range.from === value.from && range.to === value.to;
  })?.id;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          aria-invalid={invalid || undefined}
          className="w-full justify-start text-start font-normal sm:w-64"
        >
          <CalendarIcon className="h-4 w-4 opacity-50" />
          {value.from ? periodText(value.from, value.to || value.from) : 'Escolha o período'}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="flex w-auto max-w-[calc(100vw-2rem)] flex-col p-0 sm:flex-row"
        align="start"
        collisionPadding={16}
      >
        <div
          role="group"
          aria-label="Atalhos de período"
          className="grid grid-cols-3 gap-1 border-b p-3 sm:flex sm:w-28 sm:flex-col sm:border-e sm:border-b-0"
        >
          {PERIOD_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={activePreset === preset.id ? 'secondary' : 'ghost'}
              aria-pressed={activePreset === preset.id}
              className="justify-start"
              onClick={() => {
                onChange(presetRange(preset.id, today));
                setOpen(false);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="range"
          locale={ptBR}
          numberOfMonths={months}
          defaultMonth={firstMonth}
          selected={selected}
          onSelect={(range) =>
            onChange({ from: range?.from ? toDay(range.from) : '', to: range?.to ? toDay(range.to) : '' })
          }
          disabled={{ after: toDate(today) }}
        />
      </PopoverContent>
    </Popover>
  );
}
