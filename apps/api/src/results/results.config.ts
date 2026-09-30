import { createHash } from 'node:crypto';

/**
 * Credenciais da integração de resultados (Loteria Integrada). O token do webhook é escolhido por nós e cadastrado
 * no painel do provedor (ele aceita de 10 a 32 caracteres); exigimos pelo menos 24. Vazio = webhook desativado.
 */
export const RESULTS_WEBHOOK_TOKEN_LENGTH = { min: 24, max: 32 } as const;

/** Só caracteres visíveis de ASCII, sem espaço: o token vai em cabeçalhos HTTP. */
const TOKEN_CHARS = /^[\x21-\x7e]+$/;

/** RESULTS_WEBHOOK_TOKEN: devolve só o digest (o texto não fica na configuração carregada). */
export function parseResultsWebhookToken(raw: string | undefined): Buffer | null {
  const token = raw?.trim();
  if (!token) return null;
  const { min, max } = RESULTS_WEBHOOK_TOKEN_LENGTH;
  if (token.length < min || token.length > max || !TOKEN_CHARS.test(token)) {
    throw new Error(`RESULTS_WEBHOOK_TOKEN: use de ${min} a ${max} caracteres visíveis, sem espaços`);
  }
  return createHash('sha256').update(token, 'utf8').digest();
}

export const DEFAULT_RESULTS_API_URL = 'https://api.lotoserv.com/resultados/consulta/v1/';

export interface ResultsConsultaConfig {
  url: URL;
  token: string;
  /** Cota mensal do contrato (RESULTS_API_MONTHLY_QUOTA); null = não informada (só conta, não trava). */
  monthlyQuota: number | null;
  /** Para de consultar ao chegar nesta % da cota (RESULTS_API_QUOTA_STOP_PERCENT, padrão 90). */
  quotaStopPercent: number;
  /** Consulta que voltou há menos disto (minutos) não se repete (RESULTS_API_COOLDOWN_MINUTES, padrão 10). */
  cooldownMinutes: number;
}

/** Inteiro do ambiente dentro da faixa; vazio = padrão. */
function envInt(env: NodeJS.ProcessEnv, name: string, min: number, max: number, fallback: number | null) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < min || value > max) throw new Error(`${name}: use um inteiro de ${min} a ${max}`);
  return value;
}

/**
 * API de consulta (RESULTS_API_URL e RESULTS_API_TOKEN, este fornecido pelo provedor). Sem token = consulta
 * desativada (null). A URL precisa ser HTTPS; HTTP só em 127.0.0.1/localhost (testes).
 */
export function loadResultsConsultaConfig(env: NodeJS.ProcessEnv): ResultsConsultaConfig | null {
  const token = env.RESULTS_API_TOKEN?.trim();
  if (!token) return null;
  if (token.length < 10 || token.length > 512 || !TOKEN_CHARS.test(token)) {
    throw new Error('RESULTS_API_TOKEN: token inválido (10 a 512 caracteres visíveis, sem espaços)');
  }
  let url: URL;
  try {
    url = new URL(env.RESULTS_API_URL?.trim() || DEFAULT_RESULTS_API_URL);
  } catch {
    throw new Error('RESULTS_API_URL: URL inválida');
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('RESULTS_API_URL: use HTTPS');
  }
  if (url.username || url.password) throw new Error('RESULTS_API_URL: não coloque credenciais na URL');
  return {
    url,
    token,
    monthlyQuota: envInt(env, 'RESULTS_API_MONTHLY_QUOTA', 1, 100_000_000, null),
    quotaStopPercent: envInt(env, 'RESULTS_API_QUOTA_STOP_PERCENT', 1, 100, 90)!,
    cooldownMinutes: envInt(env, 'RESULTS_API_COOLDOWN_MINUTES', 0, 1440, 10)!,
  };
}
