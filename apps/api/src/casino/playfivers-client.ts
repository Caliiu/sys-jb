import { ResponseTooLargeError, readJsonLimited } from '../common/provider-http.js';
import type { CasinoConfig } from './casino.config.js';

/** Falha ao falar com o PlayFivers, com mensagem segura para log (nunca as credenciais). */
export class PlayFiversError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PlayFiversError';
  }
}

export interface PlayFiversClientOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** O catálogo inteiro (milhares de jogos) cabe com folga; o lançamento tem poucos bytes. */
const CATALOG_MAX_BYTES = 8_000_000;
const LAUNCH_MAX_BYTES = 64_000;

async function call(
  config: CasinoConfig,
  path: string,
  init: { method: 'GET' | 'POST'; query?: Record<string, string>; body?: unknown },
  maxBytes: number,
  options: PlayFiversClientOptions,
): Promise<unknown> {
  const url = new URL(path, config.apiUrl);
  for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value);
  let res: Response;
  try {
    res = await (options.fetchImpl ?? fetch)(url, {
      method: init.method,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      // Redirecionamento poderia levar as credenciais para outro host.
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch {
    throw new PlayFiversError('provedor de cassino fora do ar ou sem resposta');
  }
  let body: unknown;
  try {
    body = await readJsonLimited(res, maxBytes);
  } catch (error) {
    if (error instanceof ResponseTooLargeError) throw new PlayFiversError('resposta grande demais', res.status);
    throw new PlayFiversError('resposta ilegível', res.status);
  }
  if (!res.ok) throw new PlayFiversError(`provedor de cassino recusou (HTTP ${res.status})`, res.status);
  return body;
}

/** Catálogo de jogos (GET /api/v2/games). Devolve o corpo cru; a validação é de quem chama. */
export function fetchCasinoGames(config: CasinoConfig, options: PlayFiversClientOptions = {}): Promise<unknown> {
  return call(
    config,
    '/api/v2/games',
    { method: 'GET', query: { agentToken: config.agentToken, secretKey: config.secretKey } },
    CATALOG_MAX_BYTES,
    { timeoutMs: 30_000, ...options },
  );
}

/** Provedores com a carteira de cada um (GET /api/v2/providers). Corpo cru; a validação é de quem chama. */
export function fetchCasinoProviders(config: CasinoConfig, options: PlayFiversClientOptions = {}): Promise<unknown> {
  return call(
    config,
    '/api/v2/providers',
    { method: 'GET', query: { agentToken: config.agentToken, secretKey: config.secretKey } },
    LAUNCH_MAX_BYTES * 4,
    options,
  );
}

export interface LaunchInput {
  /** Jogador como aparece no painel do provedor: "<ID> <primeiro nome> - <banca>" (casino-user-code.ts). */
  userCode: string;
  gameCode: string;
  provider: string;
  original: boolean;
  /** Disponível Games em centavos (vai em reais, na moeda do agente). */
  balanceCents: number;
}

/** Endereço do jogo para o jogador (POST /api/v2/game_launch), conferido: só https, sem credenciais. */
export async function launchCasinoGame(
  config: CasinoConfig,
  input: LaunchInput,
  options: PlayFiversClientOptions = {},
): Promise<string> {
  const body = await call(
    config,
    '/api/v2/game_launch',
    {
      method: 'POST',
      body: {
        agentToken: config.agentToken,
        secretKey: config.secretKey,
        user_code: input.userCode,
        game_code: input.gameCode,
        provider: input.provider,
        game_original: input.original,
        user_balance: input.balanceCents / 100,
        lang: 'pt',
      },
    },
    LAUNCH_MAX_BYTES,
    options,
  );
  const launch = (body as { launch_url?: unknown } | undefined)?.launch_url;
  if (typeof launch !== 'string' || launch.length > 4096) throw new PlayFiversError('lançamento sem endereço');
  let url: URL;
  try {
    url = new URL(launch);
  } catch {
    throw new PlayFiversError('endereço do jogo inválido');
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw new PlayFiversError('endereço do jogo inválido');
  return url.toString();
}
