/** Só caracteres visíveis de ASCII, sem espaço: o token vai no cabeçalho Authorization. */
const TOKEN_CHARS = /^[\x21-\x7e]+$/;

export const DEFAULT_HOROSCOPE_API_URL = 'https://api.lotoserv.com/horoscopo/v1/';

export interface HoroscopeConfig {
  url: URL;
  token: string;
  /** Horário da busca diária, em minutos desde a meia-noite de Brasília (HOROSCOPE_SYNC_AT, padrão 00:01). */
  syncMinutes: number;
  /** Espera entre tentativas quando o provedor ainda não publicou ou falhou (HOROSCOPE_RETRY_MINUTES, padrão 15). */
  retryMinutes: number;
}

/**
 * API de horóscopo (HOROSCOPE_API_URL e HOROSCOPE_API_TOKEN, fornecido pelo provedor). Sem token = integração
 * desligada (null): a tela usa o texto local. URL só HTTPS (HTTP só em 127.0.0.1/localhost, para testes).
 */
export function loadHoroscopeConfig(env: NodeJS.ProcessEnv): HoroscopeConfig | null {
  const token = env.HOROSCOPE_API_TOKEN?.trim();
  if (!token) return null;
  if (token.length < 10 || token.length > 512 || !TOKEN_CHARS.test(token)) {
    throw new Error('HOROSCOPE_API_TOKEN: token inválido (10 a 512 caracteres visíveis, sem espaços)');
  }

  let url: URL;
  try {
    url = new URL(env.HOROSCOPE_API_URL?.trim() || DEFAULT_HOROSCOPE_API_URL);
  } catch {
    throw new Error('HOROSCOPE_API_URL: URL inválida');
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('HOROSCOPE_API_URL: use HTTPS');
  }
  if (url.username || url.password) throw new Error('HOROSCOPE_API_URL: não coloque credenciais na URL');

  const syncAt = env.HOROSCOPE_SYNC_AT?.trim() || '00:01';
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(syncAt);
  if (!match) throw new Error('HOROSCOPE_SYNC_AT: use HH:MM (ex.: 00:01)');

  const retryRaw = env.HOROSCOPE_RETRY_MINUTES?.trim() || '15';
  const retryMinutes = Number(retryRaw);
  if (!/^\d+$/.test(retryRaw) || retryMinutes < 1 || retryMinutes > 720) {
    throw new Error('HOROSCOPE_RETRY_MINUTES: use um inteiro de 1 a 720');
  }

  return { url, token, syncMinutes: Number(match[1]) * 60 + Number(match[2]), retryMinutes };
}
