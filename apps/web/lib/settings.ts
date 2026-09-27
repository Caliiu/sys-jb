/** Preferências do usuário na página de Configurações. */
export interface UserSettings {
  /** Botão "+ PULE": inicia uma nova aposta repetindo data, loteria e cotação da anterior. */
  quickBet: boolean;
  /** Quer receber notificações do aplicativo (só vale com a permissão do navegador concedida). */
  notifications: boolean;
  /** Mostra o valor do possível prêmio nos recibos das apostas. */
  showPrize: boolean;
}

export type SettingKey = keyof UserSettings;

/** Padrões: como aparecem no primeiro acesso (aposta rápida e possível prêmio ligados; notificações desligadas). */
export const DEFAULT_SETTINGS: Readonly<UserSettings> = {
  quickBet: true,
  notifications: false,
  showPrize: true,
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

/** Uma chave por usuário no navegador: outro usuário no mesmo aparelho não herda as preferências. */
export const settingsStorageKey = (userId: string) => `sysjb:settings:${userId}`;

/**
 * Lê o que estava guardado. O armazenamento do navegador pode ter sido alterado à mão ou vir de uma
 * versão antiga: cada preferência só vale se for exatamente booleana, senão fica o padrão.
 */
export function parseSettings(raw: string | null): UserSettings {
  const settings: UserSettings = { ...DEFAULT_SETTINGS };
  if (!raw) return settings;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return settings;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return settings;

  const stored = data as Record<string, unknown>;
  for (const key of SETTING_KEYS) {
    const value = stored[key];
    if (typeof value === 'boolean') settings[key] = value;
  }
  return settings;
}

/** Só as preferências conhecidas vão para o armazenamento (nada de chaves soltas). */
export function serializeSettings(settings: UserSettings): string {
  return JSON.stringify(Object.fromEntries(SETTING_KEYS.map((key) => [key, settings[key]])));
}
