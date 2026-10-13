'use client';

import { type ComponentProps } from 'react';
import { Input } from '@/admin/components/ui/input';
import { cn } from '@/admin/lib/utils';
import { formatCents, parseCurrencyInput } from '@/lib/currency';

type MoneyInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  /** Centavos; null = vazio. */
  value: number | null;
  onValueChange: (cents: number | null) => void;
  /** Teto do campo (centavos): o que passar dele é ignorado, como na máscara do app. */
  maxCents: number;
  /** R$ 0,00 é um valor válido (ex.: prêmio desligado): mostra "0,00" e o devolve como 0, nunca null. */
  allowZero?: boolean;
};

/** Valor em reais com máscara de moeda: cada dígito entra pela direita (centavos). Vazio = null (ou 0 com `allowZero`). */
export function MoneyInput({
  value,
  onValueChange,
  maxCents,
  allowZero = false,
  className,
  ...props
}: MoneyInputProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-muted-foreground">
        R$
      </span>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={cn('ps-9 tabular-nums', className)}
        value={value === null ? '' : formatCents(value)}
        onChange={(event) => {
          const cents = parseCurrencyInput(event.target.value, maxCents);
          if (cents === null) return;
          onValueChange(cents === 0 && !allowZero ? null : cents);
        }}
      />
    </div>
  );
}
