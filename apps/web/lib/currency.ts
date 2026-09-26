const BRL_NUMBER = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Centavos (inteiro) -> "1.234,56" (sem o "R$", que as telas exibem separado). */
export function formatCents(cents: number): string {
  return BRL_NUMBER.format(cents / 100);
}

/** "R$ 1.234,56" */
export function formatBrl(cents: number): string {
  return `R$ ${formatCents(cents)}`;
}

/**
 * Campo de valor estilo máscara de moeda: cada dígito digitado entra pela direita (centavos).
 * Retorna null se o resultado passar do teto, para a tela manter o valor anterior.
 */
export function parseCurrencyInput(raw: string, maxCents: number): number | null {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return 0;
  if (digits.length > String(maxCents).length) return null;
  const cents = Number(digits);
  return cents > maxCents ? null : cents;
}
