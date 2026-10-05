import { digestKey } from '../config/config.js';

/** Só caracteres visíveis de ASCII, sem espaço. */
const VISIBLE = /^[\x21-\x7e]+$/;

export const DEFAULT_PLAYFIVERS_API_URL = 'https://api.playfivers.com';
/** Sincronização do catálogo de jogos (horas). */
const CATALOG_SYNC_HOURS = 12;

export interface CasinoConfig {
  /** Base da API do provedor (https). */
  apiUrl: URL;
  /** Credenciais do agente no PlayFivers (só no servidor da API; nunca vão para o navegador nem para o log). */
  agentToken: string;
  secretKey: string;
  /** Código do agente que vem nas transações (PLAYFIVERS_AGENT_CODE); null = não confere esse campo. */
  agentCode: string | null;
  /** SHA-256 do token do endereço do webhook (CASINO_WEBHOOK_TOKEN); null = webhook desativado. */
  webhookTokenDigest: Buffer | null;
  /**
   * Carteiras do PlayFivers cujos provedores entram no lobby (PLAYFIVERS_WALLETS, nomes como no painel deles, ex.
   * "Carteira Oficial (Slots)"), já normalizadas (walletKey); null = todas as carteiras.
   */
  wallets: string[] | null;
  /** Intervalo da sincronização do catálogo (ms); null = sem sincronização automática (testes). */
  catalogSyncMs: number | null;
}

/** Nome de carteira comparável: sem diferença de maiúsculas, acentos ou espaços repetidos. */
export const walletKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** "Carteira Oficial (Slots), OFICIAL - PG Soft" -> chaves; vazio = null (todas). */
function parseWallets(raw: string | undefined): string[] | null {
  const names = (raw ?? '').split(',').map(walletKey).filter(Boolean);
  if (names.length === 0) return null;
  if (names.some((n) => n.length > 80)) throw new Error('PLAYFIVERS_WALLETS: nome de carteira longo demais');
  return [...new Set(names)];
}

function secret(name: string, raw: string | undefined, min: number): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (value.length < min || value.length > 512 || !VISIBLE.test(value)) {
    throw new Error(`${name}: valor inválido (${min} a 512 caracteres visíveis, sem espaços)`);
  }
  return value;
}

/**
 * Cassino (PlayFivers). Sem PLAYFIVERS_AGENT_TOKEN e PLAYFIVERS_SECRET_KEY o cassino fica desligado (null): o lobby
 * avisa e nenhum jogo abre. O webhook (saldo e rodadas) só funciona com CASINO_WEBHOOK_TOKEN, que vai no endereço
 * cadastrado no provedor. URL da API só HTTPS (HTTP só em 127.0.0.1/localhost, para testes).
 */
export function loadCasinoConfig(env: NodeJS.ProcessEnv): CasinoConfig | null {
  const agentToken = secret('PLAYFIVERS_AGENT_TOKEN', env.PLAYFIVERS_AGENT_TOKEN, 8);
  const secretKey = secret('PLAYFIVERS_SECRET_KEY', env.PLAYFIVERS_SECRET_KEY, 8);
  if (!agentToken || !secretKey) return null;

  let apiUrl: URL;
  try {
    apiUrl = new URL(env.PLAYFIVERS_API_URL?.trim() || DEFAULT_PLAYFIVERS_API_URL);
  } catch {
    throw new Error('PLAYFIVERS_API_URL: URL inválida');
  }
  const local = apiUrl.hostname === '127.0.0.1' || apiUrl.hostname === 'localhost';
  if (apiUrl.protocol !== 'https:' && !(apiUrl.protocol === 'http:' && local)) {
    throw new Error('PLAYFIVERS_API_URL: use HTTPS');
  }
  if (apiUrl.username || apiUrl.password) throw new Error('PLAYFIVERS_API_URL: não coloque credenciais na URL');

  const webhookToken = secret('CASINO_WEBHOOK_TOKEN', env.CASINO_WEBHOOK_TOKEN, 24);
  return {
    apiUrl,
    agentToken,
    secretKey,
    agentCode: secret('PLAYFIVERS_AGENT_CODE', env.PLAYFIVERS_AGENT_CODE, 1),
    webhookTokenDigest: webhookToken ? digestKey(webhookToken) : null,
    wallets: parseWallets(env.PLAYFIVERS_WALLETS),
    catalogSyncMs: CATALOG_SYNC_HOURS * 60 * 60 * 1000,
  };
}
