const BRL_NUMBER = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Centavos (inteiro) -> "1.234,56" (sem o "R$", que as telas exibem separado). */
export function formatCents(cents: number): string {
  return BRL_NUMBER.format(cents / 100);
}
