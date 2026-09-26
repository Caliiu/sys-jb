import { maskCpfInput, maskPhoneInput } from './masks';
import { normalizePixKey, PIX_KEY_TYPES, type PixKeyType, pixKeyDisplay, pixKeyProblem } from './pix-key';

/** Chave Pix usada antes, guardada já normalizada (CPF e celular só dígitos, e-mail e aleatória em minúsculas). */
export interface RecentPixKey {
  type: PixKeyType;
  value: string;
}

/** Quantas chaves recentes ficam guardadas. */
export const MAX_RECENT_PIX_KEYS = 5;

/** Uma chave por usuário no navegador: outro usuário logado no mesmo aparelho não enxerga as chaves deste. */
export const recentKeysStorageKey = (userId: string) => `sysjb:recent-pix-keys:${userId}`;

/** Forma guardada: CPF e celular só dígitos; e-mail e aleatória em minúsculas e sem espaços nas pontas. */
export function normalizeRecentKey(type: PixKeyType, value: string): RecentPixKey {
  return { type, value: normalizePixKey(type, value) };
}

/** Coloca a chave no topo (sem repetir) e mantém só as mais recentes. */
export function rememberKey(list: readonly RecentPixKey[], entry: RecentPixKey): RecentPixKey[] {
  const others = list.filter((item) => item.type !== entry.type || item.value !== entry.value);
  return [entry, ...others].slice(0, MAX_RECENT_PIX_KEYS);
}

/**
 * Lê o que estava guardado. O armazenamento do navegador pode ter sido alterado à mão: só passa
 * o que tem o formato esperado e é uma chave válida (CPF sempre o do titular).
 */
export function parseRecentKeys(raw: string | null, holderDocument: string): RecentPixKey[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const valid: RecentPixKey[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const { type, value } = item as Record<string, unknown>;
    if (typeof value !== 'string' || !PIX_KEY_TYPES.some((known) => known === type)) continue;
    const entry = normalizeRecentKey(type as PixKeyType, value);
    if (pixKeyProblem(entry.type, entry.value, holderDocument) === null) valid.push(entry);
  }
  return valid.slice(0, MAX_RECENT_PIX_KEYS);
}

/** Como a chave aparece no botão da lista de recentes. */
export function recentKeyLabel(entry: RecentPixKey): string {
  return pixKeyDisplay(entry.type, entry.value);
}

/** Texto do campo ao escolher uma chave recente (mesma máscara de quem digita). */
export function recentKeyFieldValue(entry: RecentPixKey): string {
  switch (entry.type) {
    case 'cpf':
      return maskCpfInput(entry.value);
    case 'phone':
      return maskPhoneInput(entry.value);
    default:
      return entry.value;
  }
}
