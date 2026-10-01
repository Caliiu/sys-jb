/** Só caracteres visíveis de ASCII, sem espaço: o token vai no cabeçalho Authorization. */
const TOKEN_CHARS = /^[\x21-\x7e]+$/;

/**
 * Endpoint real da API de atrasados. A documentação do provedor fala em /atrasados/consulta/v1/, que não existe no
 * servidor (404 da hospedagem); o que responde é /atrasados/v1/.
 */
export const DEFAULT_OVERDUE_API_URL = 'https://api.lotoserv.com/atrasados/v1/';

export interface OverdueConfig {
  url: URL;
  token: string;
  /**
   * Validade do cache de uma loteria/extração (OVERDUE_CACHE_MINUTES, padrão 30). Resultado novo do sorteio invalida
   * antes; o prazo cobre o resultado que chegar ao provedor antes de chegar aqui. Cada busca consome a cota do plano.
   */
  cacheMinutes: number;
}

/**
 * API de atrasados (OVERDUE_API_URL e OVERDUE_API_TOKEN, fornecido pelo provedor). Sem token = integração desligada
 * (null): os atrasados saem dos resultados guardados aqui. URL só HTTPS (HTTP só em 127.0.0.1/localhost, para testes).
 */
export function loadOverdueConfig(env: NodeJS.ProcessEnv): OverdueConfig | null {
  const token = env.OVERDUE_API_TOKEN?.trim();
  if (!token) return null;
  if (token.length < 10 || token.length > 512 || !TOKEN_CHARS.test(token)) {
    throw new Error('OVERDUE_API_TOKEN: token inválido (10 a 512 caracteres visíveis, sem espaços)');
  }

  let url: URL;
  try {
    url = new URL(env.OVERDUE_API_URL?.trim() || DEFAULT_OVERDUE_API_URL);
  } catch {
    throw new Error('OVERDUE_API_URL: URL inválida');
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('OVERDUE_API_URL: use HTTPS');
  }
  if (url.username || url.password) throw new Error('OVERDUE_API_URL: não coloque credenciais na URL');
  if (url.search) throw new Error('OVERDUE_API_URL: não coloque parâmetros na URL');

  const cacheRaw = env.OVERDUE_CACHE_MINUTES?.trim() || '30';
  const cacheMinutes = Number(cacheRaw);
  if (!/^\d+$/.test(cacheRaw) || cacheMinutes < 1 || cacheMinutes > 1440) {
    throw new Error('OVERDUE_CACHE_MINUTES: use um inteiro de 1 a 1440');
  }

  return { url, token, cacheMinutes };
}
