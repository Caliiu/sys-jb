'use client';

import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { ptBR } from 'react-day-picker/locale';
import { Button } from '@/admin/components/ui/button';
import { Calendar } from '@/admin/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/admin/components/ui/popover';
import { presetRange } from '@/lib/admin/period';
import { formatCalendarDate } from '@/lib/datetime';

type DayPickerProps = {
  id?: string;
  /** Dia escolhido (YYYY-MM-DD); vazio = nenhum (mostra `placeholder`). */
  value: string;
  onChange: (day: string) => void;
  /** Hoje (YYYY-MM-DD, Brasília): maior data escolhível e base dos atalhos. */
  today: string;
  /** Texto sem dia escolhido. */
  placeholder?: string;
};

/** "YYYY-MM-DD" -> Date local (meia-noite), como o calendário trabalha. */
const toDate = (day: string) => new Date(`${day}T00:00:00`);

/** Um dia só, no estilo do seletor de data do template, com os atalhos Hoje e Ontem; sem datas futuras. */
export function DayPicker({ id, value, onChange, today, placeholder = 'Escolha uma data' }: DayPickerProps) {
  const [open, setOpen] = useState(false);
  const shortcuts = [
    { label: 'Hoje', day: today },
    { label: 'Ontem', day: presetRange('yesterday', today).from },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" className="w-full justify-start text-start font-normal sm:w-48">
          <CalendarIcon className="h-4 w-4 opacity-50" />
          {value ? formatCalendarDate(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto flex-col p-0 sm:flex-row" align="start" collisionPadding={16}>
        <div
          role="group"
          aria-label="Atalhos de data"
          className="grid grid-cols-2 gap-1 border-b p-3 sm:flex sm:w-24 sm:flex-col sm:border-e sm:border-b-0"
        >
          {shortcuts.map((shortcut) => (
            <Button
              key={shortcut.label}
              type="button"
              size="sm"
              variant={value === shortcut.day ? 'secondary' : 'ghost'}
              aria-pressed={value === shortcut.day}
              className="justify-start"
              onClick={() => {
                onChange(shortcut.day);
                setOpen(false);
              }}
            >
              {shortcut.label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="single"
          locale={ptBR}
          defaultMonth={toDate(value || today)}
          selected={value ? toDate(value) : undefined}
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, 'yyyy-MM-dd'));
            setOpen(false);
          }}
          disabled={{ after: toDate(today) }}
        />
      </PopoverContent>
    </Popover>
  );
}
