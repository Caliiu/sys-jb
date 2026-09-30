/**
 * Horóscopo do dia (Loterias > Horóscopo). As previsões vêm da API de horóscopo do provedor (Loteria Integrada), que a
 * API busca uma vez por dia e guarda; o jogador lê do cache. Os ids são os nomes dos signos sem acento, em minúsculas.
 */

export const HOROSCOPE_SIGNS = [
  'aries',
  'touro',
  'gemeos',
  'cancer',
  'leao',
  'virgem',
  'libra',
  'escorpiao',
  'sagitario',
  'capricornio',
  'aquario',
  'peixes',
] as const;
export type HoroscopeSign = (typeof HOROSCOPE_SIGNS)[number];

export const isHoroscopeSign = (value: string): value is HoroscopeSign =>
  (HOROSCOPE_SIGNS as readonly string[]).includes(value);

/** Limites de uma previsão (a API recusa o que passar; o banco confere de novo). */
export const HOROSCOPE_LIMITS = { textMax: 2000, tensMax: 10, colorsMax: 10, colorMax: 30 } as const;

/** Previsão de um signo no dia. */
export interface PublicHoroscopeReading {
  sign: HoroscopeSign;
  text: string;
  /** Dezenas da sorte ("04", "18"…), na ordem do provedor. */
  tens: string[];
  /** Cores do dia ("Vermelho"…); pode vir vazio. */
  colors: string[];
}

/** GET /v1/horoscope: previsões de hoje (Brasília). Vazio = o provedor ainda não publicou (a tela usa o texto local). */
export interface HoroscopeTodayResponse {
  /** YYYY-MM-DD. */
  date: string;
  readings: PublicHoroscopeReading[];
}
