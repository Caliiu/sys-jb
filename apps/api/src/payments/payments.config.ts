import { createHash, hkdfSync } from 'node:crypto';

export const DEFAULT_MISTICPAY_API_URL = 'https://api.misticpay.com/api/';
/** Rodada que confere no gateway os depósitos pendentes (caso o aviso do gateway não chegue). */
const SWEEP_SECONDS = 60;
/** Intervalo mínimo entre duas consultas do mesmo depósito pela rodada automática. */
const SWEEP_RECHECK_SECONDS = 120;

export interface PaymentsConfig {
  /** Chave AES-256 das credenciais dos gateways no banco (derivada de PAYMENTS_SECRET_KEY). */
  credentialsKey: Buffer;
  /** Chave HMAC do endereço do aviso (webhook) de cada depósito (derivada de PAYMENTS_SECRET_KEY). */
  webhookKey: Buffer;
  /** Base da API da MisticPay (https; http só em 127.0.0.1/localhost, para testes). */
  misticpayApiUrl: URL;
  /** Intervalo da rodada automática (ms); null = sem rodada (testes). */
  sweepIntervalMs: number | null;
  /** Consulta o mesmo depósito pendente no máximo a cada N segundos na rodada automática. */
  sweepRecheckSeconds: number;
}

/** Só caracteres visíveis de ASCII, sem espaço. */
const VISIBLE = /^[\x21-\x7e]+$/;

function httpsUrl(name: string, raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name}: URL inválida`);
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error(`${name}: use HTTPS`);
  if (url.username || url.password) throw new Error(`${name}: não coloque credenciais na URL`);
  // Caminhos relativos (transactions/create) entram depois da base: ela precisa terminar em "/".
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

/** Duas chaves independentes (cifra e HMAC) a partir do segredo do .env. */
export function derivePaymentKeys(secret: string): { credentialsKey: Buffer; webhookKey: Buffer } {
  const ikm = createHash('sha256').update(secret, 'utf8').digest();
  const derive = (info: string) => Buffer.from(hkdfSync('sha256', ikm, Buffer.alloc(0), info, 32));
  return { credentialsKey: derive('sysjb/payments/credentials'), webhookKey: derive('sysjb/payments/webhook') };
}

/**
 * Pagamentos. Sem PAYMENTS_SECRET_KEY ficam desligados (null): o painel avisa que não dá para gravar credenciais e a
 * recarga fica indisponível. Trocar a chave invalida as credenciais gravadas (é preciso salvá-las de novo) e os
 * endereços de aviso dos depósitos pendentes (a rodada automática ainda confere esses depósitos no gateway).
 */
export function loadPaymentsConfig(env: NodeJS.ProcessEnv): PaymentsConfig | null {
  const secret = env.PAYMENTS_SECRET_KEY?.trim();
  if (!secret) return null;
  if (secret.length < 32 || secret.length > 512 || !VISIBLE.test(secret)) {
    throw new Error('PAYMENTS_SECRET_KEY: valor inválido (32 a 512 caracteres visíveis, sem espaços)');
  }
  return {
    ...derivePaymentKeys(secret),
    misticpayApiUrl: httpsUrl('MISTICPAY_API_URL', env.MISTICPAY_API_URL?.trim() || DEFAULT_MISTICPAY_API_URL),
    sweepIntervalMs: SWEEP_SECONDS * 1000,
    sweepRecheckSeconds: SWEEP_RECHECK_SECONDS,
  };
}
