import { ResponseTooLargeError, providerMessage, readJsonLimited } from '../common/provider-http.js';
import type { HoroscopeConfig } from './horoscope.config.js';

/**
 * Falha da API de horóscopo, com mensagem segura para log (nunca o token). `kind` decide o que a sincronização faz:
 * - not_ready: o provedor ainda não publicou as previsões do dia ("Ainda não há previsões registradas…"): tentar depois;
 * - retryable: rede, tempo esgotado, 5xx/429: tentar depois;
 * - fatal: token recusado, limite diário, resposta estranha: só na próxima busca diária (e avisar no log).
 */
export class HoroscopeApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'not_ready' | 'retryable' | 'fatal',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HoroscopeApiError';
  }
}

export interface HoroscopeClientOptions {
  timeoutMs?: number;
  /** Tentativas extras em falha de rede/5xx (padrão 2). */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
}

/** As previsões do dia inteiro têm poucos KB. */
const MAX_RESPONSE_BYTES = 256_000;

/**
 * Busca as previsões do dia (os 12 signos numa requisição, pela data do servidor do provedor). Devolve o corpo cru;
 * a validação é de quem chama (normalizeHoroscope).
 */
export async function fetchHoroscope(config: HoroscopeConfig, options: HoroscopeClientOptions = {}): Promise<unknown> {
  const { timeoutMs = 15_000, retries = 2, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = options;
  const doFetch = options.fetchImpl ?? fetch;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await once(doFetch, config, timeoutMs);
    } catch (error) {
      const known =
        error instanceof HoroscopeApiError ? error : new HoroscopeApiError('falha inesperada na busca', 'retryable');
      // Só rede/5xx se repete aqui; "ainda não publicou" e recusas voltam para a sincronização decidir.
      if (known.kind !== 'retryable' || attempt >= retries) throw known;
      await sleep(500 * 3 ** attempt);
    }
  }
}

async function once(doFetch: typeof fetch, config: HoroscopeConfig, timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await doFetch(config.url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
      // Redirecionamento poderia levar o token para outro host.
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new HoroscopeApiError('sem resposta do horóscopo (rede ou tempo esgotado)', 'retryable');
  }

  let body: unknown;
  try {
    body = await readJsonLimited(res, MAX_RESPONSE_BYTES);
  } catch (error) {
    if (error instanceof ResponseTooLargeError)
      throw new HoroscopeApiError('resposta do horóscopo grande demais', 'fatal');
    throw new HoroscopeApiError('falha ao ler a resposta do horóscopo', 'retryable');
  }
  if (res.status === 200) return body;

  const reason = providerMessage(body);
  const message = `horóscopo recusado (HTTP ${res.status})${reason ? `: ${reason}` : ''}`;
  if (reason && /ainda n[ãa]o h[áa] previs/i.test(reason))
    throw new HoroscopeApiError(message, 'not_ready', res.status);
  const retryable = res.status >= 500 || res.status === 429;
  throw new HoroscopeApiError(message, retryable ? 'retryable' : 'fatal', res.status);
}
