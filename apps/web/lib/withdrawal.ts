import {
  type PublicWallet,
  type PublicWithdrawal,
  type PublicWithdrawalStatus,
  WITHDRAWAL_LIMITS,
  type WithdrawalKeyType,
  type WithdrawalSettings,
} from '@sysjb/contracts';
import { formatBrl, parseCurrencyInput } from './currency';
import { formatDate } from './datetime';
import { normalizePixKey, PIX_KEY_TYPES, type PixKeyType, pixKeyProblem } from './pix-key';

/** Teto de digitação (R$ 1.000.000,00): só evita números absurdos; os limites reais são da banca e o disponível. */
export const MAX_WITHDRAWAL_INPUT_CENTS = WITHDRAWAL_LIMITS.maxCents;

/** Valores rápidos (R$ 10, 20, 50, 100), em centavos. O de R$ 10 leva o selo "HOT". */
export const QUICK_WITHDRAWAL_CENTS = [1000, 2000, 5000, 10000] as const;
export const HOT_WITHDRAWAL_CENTS = 1000;

/** Limites de saque da banca, como a tela usa (o servidor confere de novo). */
export type WithdrawalLimits = Pick<WithdrawalSettings, 'enabled' | 'minCents' | 'maxCents' | 'dailyCount'> & {
  /** Saques que já contam no limite de hoje. */
  usedToday: number;
};

/** Padrão da banca que ainda não gravou limites (o mesmo da API). */
export const DEFAULT_WITHDRAWAL_LIMITS: WithdrawalLimits = {
  enabled: true,
  minCents: 1000,
  maxCents: 500000,
  dailyCount: 3,
  usedToday: 0,
};

export interface WithdrawalSummary {
  /** Prêmios das loterias e da fazendinha. */
  lotteries: number;
  /** Ganhos do cassino. */
  casino: number;
  /** O que pode ser sacado: os dois prêmios (recarga e bônus nunca). */
  available: number;
}

/** Resumo do saldo da tela de saque: só prêmios podem ser resgatados (das loterias e do cassino). */
export function withdrawalSummary(wallet: PublicWallet): WithdrawalSummary {
  return { lotteries: wallet.prizesJb, casino: wallet.prizesGames, available: wallet.withdrawable };
}

/** Campo de valor do saque (máscara de moeda). null = passou do teto de digitação. */
export const parseWithdrawalAmount = (raw: string): number | null =>
  parseCurrencyInput(raw, MAX_WITHDRAWAL_INPUT_CENTS);

/** Maior valor que dá para sacar agora: o disponível, até o máximo por saque da banca. */
export const maxWithdrawalCents = (availableCents: number, limits: WithdrawalLimits): number =>
  Math.min(availableCents, limits.maxCents);

/** Pode solicitar? Saques ligados, ainda há saque no dia e o valor entre o mínimo e o máximo de agora. */
export const isWithdrawalAmountValid = (cents: number, availableCents: number, limits: WithdrawalLimits): boolean =>
  limits.enabled &&
  limits.usedToday < limits.dailyCount &&
  cents >= limits.minCents &&
  cents <= maxWithdrawalCents(availableCents, limits);

/** Mensagem de erro do valor digitado, ou null. Valor zero não é erro: a tela só orienta. */
export function withdrawalAmountProblem(
  cents: number,
  availableCents: number,
  limits: WithdrawalLimits,
): string | null {
  if (cents === 0) return null;
  if (cents > availableCents) return 'Valor maior que o disponível para resgate';
  if (cents > limits.maxCents) return `Valor máximo por saque: ${formatBrl(limits.maxCents)}`;
  if (cents < limits.minCents) return `Valor mínimo para saque: ${formatBrl(limits.minCents)}`;
  return null;
}

/** Aviso que impede qualquer saque agora (pausado ou limite do dia), ou null. */
export function withdrawalBlocker(limits: WithdrawalLimits): string | null {
  if (!limits.enabled) return 'Saques pausados no momento. Tente novamente mais tarde.';
  if (limits.usedToday >= limits.dailyCount) {
    return `Você já fez ${limits.dailyCount} ${limits.dailyCount === 1 ? 'saque' : 'saques'} hoje. Tente amanhã.`;
  }
  return null;
}

/** Pedido de saque enviado pelo navegador: chave já normalizada, valor em centavos e a chave de idempotência. */
export interface WithdrawalRequest {
  keyType: PixKeyType;
  keyValue: string;
  amountCents: number;
  idempotencyKey: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida o pedido no servidor do web (o navegador não é confiável): formato, chave do tipo escolhido (CPF sempre o
 * do titular) e valor entre o piso do sistema e o disponível AGORA. Os limites da banca a API confere.
 */
export function parseWithdrawalRequest(
  input: unknown,
  holderDocument: string,
  availableCents: number,
): { ok: true; request: WithdrawalRequest } | { ok: false; message: string } {
  const invalid = { ok: false, message: 'Pedido de saque inválido.' } as const;
  if (typeof input !== 'object' || input === null) return invalid;
  const { keyType, keyValue, amountCents, idempotencyKey } = input as Record<string, unknown>;

  const type = PIX_KEY_TYPES.find((known) => known === keyType);
  if (!type || typeof keyValue !== 'string' || keyValue.length > 200) return invalid;
  if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents)) return invalid;
  if (typeof idempotencyKey !== 'string' || !UUID.test(idempotencyKey)) return invalid;

  const value = normalizePixKey(type, keyValue);
  const keyProblem = pixKeyProblem(type, value, holderDocument);
  if (keyProblem) return { ok: false, message: keyProblem };

  if (amountCents > availableCents) return { ok: false, message: 'Valor maior que o disponível para resgate' };
  if (amountCents < WITHDRAWAL_LIMITS.minCents) return invalid;

  return {
    ok: true,
    request: { keyType: type, keyValue: value, amountCents, idempotencyKey: idempotencyKey.toLowerCase() },
  };
}

export type WithdrawalStatus = PublicWithdrawalStatus;

export const WITHDRAWAL_STATUS_LABELS: Readonly<Record<WithdrawalStatus, string>> = {
  REVIEW: 'Em análise',
  PROCESSING: 'Processando',
  PAID: 'Pago',
  FAILED: 'Não pago',
  REJECTED: 'Recusado',
  CANCELED: 'Cancelado',
};

/** O que cada situação significa para o jogador (detalhes do resgate). */
export const WITHDRAWAL_STATUS_HINTS: Readonly<Record<WithdrawalStatus, string>> = {
  REVIEW: 'Aguardando a aprovação da banca. Você pode cancelar enquanto estiver em análise.',
  PROCESSING: 'Enviado para pagamento. O Pix costuma cair em poucos minutos.',
  PAID: 'Pix enviado para a sua chave.',
  FAILED: 'O pagamento não foi concluído. O valor voltou para o seu saldo de prêmios.',
  REJECTED: 'O saque foi recusado pela banca. O valor voltou para o seu saldo de prêmios.',
  CANCELED: 'Você cancelou este saque. O valor voltou para o seu saldo de prêmios.',
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
  /** Motivo da recusa (só recusado). */
  note: string | null;
  /** Pode cancelar agora (em análise). */
  cancellable: boolean;
}

const KEY_TYPE_FROM_API: Readonly<Record<WithdrawalKeyType, PixKeyType>> = {
  CPF: 'cpf',
  EMAIL: 'email',
  PHONE: 'phone',
  RANDOM: 'random',
};

/** Tipo de chave da tela -> da API. */
export const withdrawalKeyTypeForApi = (type: PixKeyType): WithdrawalKeyType =>
  (Object.keys(KEY_TYPE_FROM_API) as WithdrawalKeyType[]).find((api) => KEY_TYPE_FROM_API[api] === type)!;

/** Saque vindo da API -> item da tela. */
export function toWithdrawalItem(withdrawal: PublicWithdrawal): WithdrawalItem {
  return {
    id: withdrawal.id,
    amountCents: withdrawal.amountCents,
    status: withdrawal.status,
    keyType: KEY_TYPE_FROM_API[withdrawal.keyType],
    keyValue: withdrawal.keyValue,
    createdAt: withdrawal.createdAt,
    note: withdrawal.note,
    cancellable: withdrawal.cancellable,
  };
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
