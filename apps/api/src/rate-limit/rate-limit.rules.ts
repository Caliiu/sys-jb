/**
 * Regras de limite de requisições. Cada regra tem uma ou mais janelas fixas ("N por X segundos"); estourar qualquer
 * uma responde 429 com Retry-After. Os padrões abaixo podem ser trocados pelo .env (RATE_LIMIT_<REGRA>).
 */

export const RATE_LIMIT_RULES = [
  /** Login de jogador e de operador, por IP (soma-se ao bloqueio por CPF/e-mail após 5 falhas). */
  'login_ip',
  /** Cadastro de jogador, por IP (criação de contas em massa). */
  'signup_ip',
  /** Qualquer rota /v1, por IP: proteção contra rajadas. Generoso por causa de redes móveis com IP compartilhado. */
  'requests_ip',
  /** Jogador logado: ações que gravam (compras, Repetir pule, perfil, senha…). */
  'user_write',
  /** Jogador logado: consultas. */
  'user_read',
  /** Operador do painel: alterações (cadastros, uploads, edição de usuários…). */
  'operator_write',
  /** Operador do painel: consultas. */
  'operator_read',
] as const;
export type RateLimitRule = (typeof RATE_LIMIT_RULES)[number];

export interface RateLimitWindow {
  limit: number;
  windowSeconds: number;
}

export type RateLimitRules = Record<RateLimitRule, RateLimitWindow[]>;

export interface RateLimitConfig {
  enabled: boolean;
  rules: RateLimitRules;
}

export const DEFAULT_RATE_LIMIT_RULES: RateLimitRules = {
  login_ip: [
    { limit: 20, windowSeconds: 60 },
    { limit: 100, windowSeconds: 3600 },
  ],
  signup_ip: [
    { limit: 10, windowSeconds: 3600 },
    { limit: 30, windowSeconds: 86_400 },
  ],
  requests_ip: [{ limit: 600, windowSeconds: 60 }],
  user_write: [{ limit: 30, windowSeconds: 60 }],
  user_read: [{ limit: 180, windowSeconds: 60 }],
  operator_write: [{ limit: 60, windowSeconds: 60 }],
  operator_read: [{ limit: 300, windowSeconds: 60 }],
};

/** Maior janela aceita: 1 dia (a chave guarda o tamanho da janela com até 6 dígitos). */
const MAX_WINDOW_SECONDS = 86_400;
const MAX_LIMIT = 1_000_000;

/** "20/60,100/3600" -> [{ limit: 20, windowSeconds: 60 }, { limit: 100, windowSeconds: 3600 }]. */
export function parseRateLimitWindows(name: string, raw: string): RateLimitWindow[] {
  const windows = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(\d+)\/(\d+)$/.exec(part);
      const limit = Number(match?.[1]);
      const windowSeconds = Number(match?.[2]);
      if (
        !match ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > MAX_LIMIT ||
        !Number.isInteger(windowSeconds) ||
        windowSeconds < 1 ||
        windowSeconds > MAX_WINDOW_SECONDS
      ) {
        throw new Error(`${name}: use "limite/segundos" (ex.: "20/60,100/3600"), janela de 1 a ${MAX_WINDOW_SECONDS}s`);
      }
      return { limit, windowSeconds };
    });
  if (windows.length === 0) throw new Error(`${name}: informe pelo menos uma janela`);
  if (new Set(windows.map((w) => w.windowSeconds)).size !== windows.length) {
    throw new Error(`${name}: janelas repetidas`);
  }
  return windows;
}

/** RATE_LIMIT_ENABLED (padrão true) e RATE_LIMIT_<REGRA> opcionais (ex.: RATE_LIMIT_LOGIN_IP=20/60,100/3600). */
export function loadRateLimitConfig(env: NodeJS.ProcessEnv): RateLimitConfig {
  const enabledRaw = (env.RATE_LIMIT_ENABLED ?? 'true').trim().toLowerCase();
  if (enabledRaw !== 'true' && enabledRaw !== 'false') throw new Error('RATE_LIMIT_ENABLED: use true ou false');
  const rules = { ...DEFAULT_RATE_LIMIT_RULES };
  for (const rule of RATE_LIMIT_RULES) {
    const name = `RATE_LIMIT_${rule.toUpperCase()}`;
    const raw = env[name]?.trim();
    if (raw) rules[rule] = parseRateLimitWindows(name, raw);
  }
  return { enabled: enabledRaw === 'true', rules };
}
