import { ResponseTooLargeError, providerMessage, readJsonLimited } from '../common/provider-http.js';
import type { OverdueConfig } from './overdue.config.js';

/**
 * Falha da API de atrasados, com mensagem segura para log (nunca o token). `kind` decide o que fazer:
 * - unavailable: a loteria ou a extração não está no plano do provedor (403): vale o nosso histórico;
 * - retryable: rede, tempo esgotado, 5xx/429: tentar de novo depois;
 * - fatal: token recusado, módulo pausado, resposta estranha: avisar no log.
 */
export class OverdueApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'unavailable' | 'retryable' | 'fatal',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'OverdueApiError';
  }
}

export interface OverdueRequest {
  /** Sigla do provedor (ex.: rj). */
  lottery: string;
  /** Extração (hora, 0–23). */
  extraction: number;
}

export interface OverdueClientOptions {
  /** O jogador espera a resposta: tempo curto. */
  timeoutMs?: number;
  /** Tentativas extras em falha de rede/5xx (padrão 1). */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
}

/** Os 25 grupos têm poucos KB. */
const MAX_RESPONSE_BYTES = 128_000;

/**
 * Atrasados de grupo na cabeça (posicao=1) de uma loteria/extração. Devolve o corpo cru; a validação é de quem chama
 * (normalizeOverdue). Cada chamada consome a cota do plano: quem chama decide quando buscar (cache).
 */
export async function fetchOverdue(
  config: OverdueConfig,
  request: OverdueRequest,
  options: OverdueClientOptions = {},
): Promise<unknown> {
  const { timeoutMs = 8_000, retries = 1, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = options;
  const doFetch = options.fetchImpl ?? fetch;

  const url = new URL(config.url);
  url.searchParams.set('loteria', request.lottery);
  url.searchParams.set('tipo_busca', 'grupo');
  url.searchParams.set('posicao', '1');
  url.searchParams.set('extracao', String(request.extraction).padStart(2, '0'));

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await once(doFetch, url, config.token, timeoutMs);
    } catch (error) {
      const known =
        error instanceof OverdueApiError ? error : new OverdueApiError('falha inesperada nos atrasados', 'retryable');
      if (known.kind !== 'retryable' || attempt >= retries) throw known;
      await sleep(300 * 3 ** attempt);
    }
  }
}

async function once(doFetch: typeof fetch, url: URL, token: string, timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      // Redirecionamento poderia levar o token para outro host.
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new OverdueApiError('sem resposta dos atrasados (rede ou tempo esgotado)', 'retryable');
  }

  let body: unknown;
  try {
    body = await readJsonLimited(res, MAX_RESPONSE_BYTES);
  } catch (error) {
    if (error instanceof ResponseTooLargeError)
      throw new OverdueApiError('resposta dos atrasados grande demais', 'fatal');
    throw new OverdueApiError('falha ao ler a resposta dos atrasados', 'retryable');
  }
  if (res.status === 200) return body;

  const reason = providerMessage(body);
  const message = `atrasados recusado (HTTP ${res.status})${reason ? `: ${reason}` : ''}`;
  // 403 = parâmetro recusado: "Loteria inválida ou não disponível" / "Extração 'NN' inválida ou não disponível…".
  if (res.status === 403) throw new OverdueApiError(message, 'unavailable', res.status);
  const retryable = res.status >= 500 || res.status === 429;
  throw new OverdueApiError(message, retryable ? 'retryable' : 'fatal', res.status);
}
