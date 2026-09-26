import type { PublicWallet } from '@sysjb/contracts';
import { formatBrl, parseCurrencyInput } from './currency';
import { formatDate } from './datetime';
import { normalizePixKey, PIX_KEY_TYPES, type PixKeyType, pixKeyProblem } from './pix-key';

/** Valor mínimo de saque (R$ 1,00), o mesmo piso da recarga. Ajuste aqui se a regra da banca for outra. */
export const MIN_WITHDRAWAL_CENTS = 100;
/** Teto de digitação (R$ 1.000.000,00): só evita números absurdos; o limite real é o disponível. */
export const MAX_WITHDRAWAL_INPUT_CENTS = 100_000_000;

/** Valores rápidos (R$ 10, 20, 50, 100), em centavos. O de R$ 10 leva o selo "HOT". */
export const QUICK_WITHDRAWAL_CENTS = [1000, 2000, 5000, 10000] as const;
export const HOT_WITHDRAWAL_CENTS = 1000;

export interface WithdrawalSummary {
  /** Saldo total das loterias (recarga + bônus + livre). */
  total: number;
  /** Saldo de recarga: não pode ser resgatado. */
  recharge: number;
  /** Bônus: não pode ser resgatado. */
  bonus: number;
  /** Total − recarga − bônus = saldo livre (prêmios). Só isso pode ser resgatado. */
  available: number;
}

/**
 * Resumo do saldo da tela de saque (regra do "Entenda": bônus e recargas não podem ser resgatados).
 * Usa o saldo das loterias, o mesmo do "Saldo" do dashboard.
 */
export function withdrawalSummary(wallet: PublicWallet): WithdrawalSummary {
  const total = wallet.totalAvailableJb;
  const recharge = wallet.balanceJb;
  const bonus = wallet.bonusJb;
  return { total, recharge, bonus, available: Math.max(0, total - recharge - bonus) };
}

/** Campo de valor do saque (máscara de moeda). null = passou do teto de digitação. */
export const parseWithdrawalAmount = (raw: string): number | null =>
  parseCurrencyInput(raw, MAX_WITHDRAWAL_INPUT_CENTS);

/** Pode solicitar? Valor entre o mínimo e o disponível. */
export const isWithdrawalAmountValid = (cents: number, availableCents: number): boolean =>
  cents >= MIN_WITHDRAWAL_CENTS && cents <= availableCents;

/** Mensagem de erro do valor digitado, ou null. Valor zero não é erro: a tela só orienta. */
export function withdrawalAmountProblem(cents: number, availableCents: number): string | null {
  if (cents === 0) return null;
  if (cents > availableCents) return 'Valor maior que o disponível para resgate';
  if (cents < MIN_WITHDRAWAL_CENTS) return `Valor mínimo para saque: ${formatBrl(MIN_WITHDRAWAL_CENTS)}`;
  return null;
}

/** Pedido de saque enviado pelo navegador: chave já normalizada e valor em centavos. */
export interface WithdrawalRequest {
  keyType: PixKeyType;
  keyValue: string;
  amountCents: number;
}

/**
 * Valida o pedido no servidor (o navegador não é confiável): formato, chave do tipo escolhido (CPF sempre
 * o do titular) e valor entre o mínimo e o disponível AGORA. Devolve a mensagem do primeiro problema.
 */
export function parseWithdrawalRequest(
  input: unknown,
  holderDocument: string,
  availableCents: number,
): { ok: true; request: WithdrawalRequest } | { ok: false; message: string } {
  const invalid = { ok: false, message: 'Pedido de saque inválido.' } as const;
  if (typeof input !== 'object' || input === null) return invalid;
  const { keyType, keyValue, amountCents } = input as Record<string, unknown>;

  const type = PIX_KEY_TYPES.find((known) => known === keyType);
  if (!type || typeof keyValue !== 'string' || keyValue.length > 200) return invalid;
  if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents)) return invalid;

  const value = normalizePixKey(type, keyValue);
  const keyProblem = pixKeyProblem(type, value, holderDocument);
  if (keyProblem) return { ok: false, message: keyProblem };

  const amountProblem = withdrawalAmountProblem(amountCents, availableCents);
  if (amountProblem) return { ok: false, message: amountProblem };
  if (!isWithdrawalAmountValid(amountCents, availableCents)) return invalid; // zero ou negativo

  return { ok: true, request: { keyType: type, keyValue: value, amountCents } };
}

export type WithdrawalStatus = 'PENDING' | 'PAID' | 'REJECTED' | 'CANCELED';

export const WITHDRAWAL_STATUS_LABELS: Readonly<Record<WithdrawalStatus, string>> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  REJECTED: 'Recusado',
  CANCELED: 'Cancelado',
};

/** Saque na lista "Meus saques". */
export interface WithdrawalItem {
  id: string;
  amountCents: number;
  status: WithdrawalStatus;
  keyType: PixKeyType;
  /** Chave de destino, normalizada (ver normalizePixKey). */
  keyValue: string;
  /** ISO 8601. */
  createdAt: string;
}

export interface WithdrawalGroup {
  /** "Hoje", "Ontem" ou a data (dd/mm/aaaa). */
  label: string;
  items: WithdrawalItem[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Agrupa por dia (fuso de Brasília), do mais recente para o mais antigo. `nowIso` vem do servidor (hidratação estável). */
export function groupWithdrawalsByDay(items: readonly WithdrawalItem[], nowIso: string): WithdrawalGroup[] {
  const now = new Date(nowIso).getTime();
  const today = formatDate(nowIso);
  const yesterday = formatDate(new Date(now - DAY_MS).toISOString());

  const groups: WithdrawalGroup[] = [];
  const newestFirst = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const item of newestFirst) {
    const day = formatDate(item.createdAt);
    const label = day === today ? 'Hoje' : day === yesterday ? 'Ontem' : day;
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
