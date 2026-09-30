import { ResponseTooLargeError, providerMessage, readJsonLimited } from '../common/provider-http.js';
import { consultaResponseSchema } from './result-normalizer.js';
import type { ResultsConsultaConfig } from './results.config.js';

/** Falha da consulta com mensagem segura para log (nunca o token nem a URL com parâmetros). */
export class ConsultaError extends Error {
  constructor(
    message: string,
    /** false = não adianta repetir (token, limite mensal, parâmetros, loteria não liberada). */
    readonly retryable: boolean,
    /** Status HTTP da resposta recusada; ausente em falha de rede ou de formato. */
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ConsultaError';
  }
}

export interface ConsultaRequest {
  /** YYYY-MM-DD. */
  date: string;
  lottery: string;
  /** Sem extração = todas as extrações do dia. */
  extraction?: number;
}

export interface ConsultaClientOptions {
  timeoutMs?: number;
  /** Tentativas extras em falha de rede/5xx (padrão 2). */
  retries?: number;
  /** Espera entre tentativas; injetável nos testes. */
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
  /**
   * Chamado a cada resposta HTTP recebida (inclusive nas novas tentativas): cada uma conta na cota do provedor.
   * Falha de rede sem resposta não chama.
   */
  onResponse?: (status: number) => void;
}

/** Resposta maior que isso é recusada (a consulta de um dia inteiro tem poucos KB). */
const MAX_RESPONSE_BYTES = 1_000_000;

/**
 * Cliente da API de consulta de resultados. Cada chamada consome a cota mensal do contrato: quem chama decide
 * quando consultar (o recebimento normal é pelo webhook). Devolve os itens crus; a normalização é de quem chama.
 */
export async function fetchResults(
  config: ResultsConsultaConfig,
  request: ConsultaRequest,
  options: ConsultaClientOptions = {},
): Promise<unknown[]> {
  const { timeoutMs = 15_000, retries = 2, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = options;
  const doFetch = options.fetchImpl ?? fetch;

  const url = new URL(config.url);
  url.searchParams.set('data', request.date);
  url.searchParams.set('loteria', request.lottery);
  if (request.extraction !== undefined) url.searchParams.set('extracao', String(request.extraction).padStart(2, '0'));

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await once(doFetch, url, config.token, timeoutMs, options.onResponse);
    } catch (error) {
      const retryable = !(error instanceof ConsultaError) || error.retryable;
      if (!retryable || attempt >= retries) {
        throw error instanceof ConsultaError ? error : new ConsultaError('falha de rede na consulta', true);
      }
      await sleep(500 * 3 ** attempt);
    }
  }
}

async function once(
  doFetch: typeof fetch,
  url: URL,
  token: string,
  timeoutMs: number,
  onResponse: ((status: number) => void) | undefined,
): Promise<unknown[]> {
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
    throw new ConsultaError('sem resposta da consulta (rede ou tempo esgotado)', true);
  }
  onResponse?.(res.status);

  const body = await readJson(res);
  if (res.status === 404) return []; // "Nenhum resultado encontrado para os dados informados"
  if (res.status !== 200) {
    const reason = providerMessage(body);
    const retryable = res.status >= 500 || res.status === 429;
    throw new ConsultaError(
      `consulta recusada (HTTP ${res.status})${reason ? `: ${reason}` : ''}`,
      retryable,
      res.status,
    );
  }
  const parsed = consultaResponseSchema.safeParse(body);
  if (!parsed.success) throw new ConsultaError('resposta da consulta em formato inesperado', false);
  return parsed.data.dados.resultados;
}

/** Corpo JSON com limite de tamanho; o erro de tamanho vira ConsultaError (não adianta repetir). */
async function readJson(res: Response): Promise<unknown> {
  try {
    return await readJsonLimited(res, MAX_RESPONSE_BYTES);
  } catch (error) {
    if (error instanceof ResponseTooLargeError) throw new ConsultaError('resposta da consulta grande demais', false);
    throw error;
  }
}
