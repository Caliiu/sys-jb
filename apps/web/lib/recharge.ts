import { formatCents } from './currency';

/** Valor mínimo de recarga (R$ 1,00), em centavos. */
export const MIN_RECHARGE_CENTS = 100;
/** Teto da tela (R$ 10.000,00): evita valores absurdos por digitação ou toques repetidos. */
export const MAX_RECHARGE_CENTS = 1_000_000;

/** Valores rápidos (+R$ 30, 50, 100, 200), em centavos. */
export const QUICK_AMOUNTS_CENTS = [3000, 5000, 10000, 20000] as const;
export const POPULAR_AMOUNT_CENTS = 5000;

export type RechargeDestination = 'lotteries' | 'games';

export interface DestinationOption {
  value: RechargeDestination;
  label: string;
  description: string;
  /** false: o bônus de recarga não vale nesse destino. */
  bonusAvailable: boolean;
}

export const DESTINATIONS: readonly DestinationOption[] = [
  { value: 'lotteries', label: 'Loterias', description: 'Válido para todas as loterias', bonusAvailable: true },
  { value: 'games', label: 'Games', description: 'Todas as modalidades', bonusAvailable: false },
];

/**
 * Campo de valor estilo máscara de moeda: cada dígito digitado entra pela direita (centavos).
 * Retorna null se o resultado passar do teto, para a tela manter o valor anterior.
 */
export function parseAmountInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return 0;
  if (digits.length > String(MAX_RECHARGE_CENTS).length) return null;
  const cents = Number(digits);
  return cents > MAX_RECHARGE_CENTS ? null : cents;
}

/** Soma um valor rápido ao atual, respeitando o teto. */
export function addAmount(currentCents: number, deltaCents: number): number {
  return Math.min(currentCents + deltaCents, MAX_RECHARGE_CENTS);
}

/** "R$ 1.234,56" */
export function formatBrl(cents: number): string {
  return `R$ ${formatCents(cents)}`;
}

/** Mensagem de erro do formulário, ou null se pode avançar. */
export function validateRecharge(cents: number, destination: RechargeDestination | null): string | null {
  if (cents < MIN_RECHARGE_CENTS) return `Informe um valor mínimo de ${formatBrl(MIN_RECHARGE_CENTS)}.`;
  if (!destination) return 'Escolha onde usar o crédito.';
  return null;
}

/** Tempo para pagar a cobrança Pix, em segundos. */
export const PIX_CHARGE_SECONDS = 300;

/** Cobrança Pix pronta para pagamento. */
export interface PixCharge {
  /** BR Code "copia e cola"; o mesmo texto vira o QR Code. */
  code: string;
  amountCents: number;
  /** ISO 8601. */
  expiresAt: string;
  durationSeconds: number;
  /** true: cobrança de desenvolvimento, que nenhum banco consegue pagar. */
  isTest: boolean;
}

export interface ChargeRequest {
  amountCents: number;
  destination: RechargeDestination;
}

/** Valida o pedido de cobrança vindo do navegador (entrada não confiável). null se inválido. */
export function parseChargeRequest(input: unknown): ChargeRequest | null {
  if (typeof input !== 'object' || input === null) return null;
  const { amountCents, destination: rawDestination } = input as Record<string, unknown>;
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents > MAX_RECHARGE_CENTS)
    return null;
  const destination = DESTINATIONS.find((option) => option.value === rawDestination)?.value;
  if (!destination || validateRecharge(amountCents, destination)) return null;
  return { amountCents, destination };
}

/** Segundos -> "MM:SS". */
export function formatClock(totalSeconds: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;
}
