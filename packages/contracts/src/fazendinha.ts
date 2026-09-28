/**
 * Fazendinha: o jogador compra palpites de grupo, dezena ou centena numa extração; cada palpite custa o
 * valor da aposta e paga `valor × multiplicador` se acertar. Cada número só pode ser vendido uma vez por
 * extração, modalidade e valor. As extrações vêm do cadastro de sorteios da banca (draws.ts); as regras daqui
 * são compartilhadas entre o web (tela) e a API (validação da compra). Valores em centavos; horários em Brasília.
 */

import type { Cents, PublicWallet } from './index.js';

export const FAZENDINHA_MODE_IDS = ['grupo', 'dezena', 'centena'] as const;
export type FazendinhaModeId = (typeof FAZENDINHA_MODE_IDS)[number];

export interface FazendinhaMode {
  id: FazendinhaModeId;
  label: string;
  /**
   * Cotação padrão (prêmio = aposta × multiplicador), usada enquanto a banca não configura a sua tabela
   * (quotes.ts). O que vale na compra é a cotação da banca.
   */
  multiplier: number;
  /** Quantos palpites existem na modalidade (25 grupos, 100 dezenas, 1000 centenas). */
  numbers: number;
  /** Menor palpite válido (grupos começam em 1; dezenas e centenas em 0). */
  min: number;
}

export const FAZENDINHA_MODES: FazendinhaMode[] = [
  { id: 'grupo', label: 'GRUPO', multiplier: 22, numbers: 25, min: 1 },
  { id: 'dezena', label: 'DEZENA', multiplier: 88, numbers: 100, min: 0 },
  { id: 'centena', label: 'CENTENA', multiplier: 880, numbers: 1000, min: 0 },
];

/** Valores de aposta possíveis (R$ 1 a R$ 100). Os oferecidos são os que têm prêmio na cotação da banca. */
export const FAZENDINHA_STAKES_CENTS = [100, 300, 500, 700, 1000, 1500, 2000, 2500, 3000, 5000, 10000];

/** Máximo de palpites numa compra. */
export const FAZENDINHA_MAX_NUMBERS_PER_BET = 100;

/** Quantos dias à frente (além de hoje) aceitam apostas. */
export const FAZENDINHA_MAX_DAY_OFFSET = 6;

export const findFazendinhaMode = (id: string) => FAZENDINHA_MODES.find((m) => m.id === id);

export const isValidPalpite = (mode: FazendinhaMode, value: number) =>
  Number.isInteger(value) && value >= mode.min && value < mode.min + mode.numbers;

const SP_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/** Data de calendário, hora e minuto de um instante, em Brasília. */
export function brasiliaNow(iso: string) {
  const parts = Object.fromEntries(SP_PARTS.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Data (YYYY-MM-DD) de `offset` dias a partir de hoje, em Brasília. */
export function drawDateOf(nowIso: string, offset: number): string {
  const { year, month, day } = brasiliaNow(nowIso);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

/** Quantos dias `drawDate` (YYYY-MM-DD) está de hoje em Brasília; null se não for uma data válida. */
export function dayOffsetOf(nowIso: string, drawDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) return null;
  const date = Date.parse(`${drawDate}T00:00:00Z`);
  if (Number.isNaN(date) || new Date(date).toISOString().slice(0, 10) !== drawDate) return null;
  return Math.round((date - Date.parse(`${drawDateOf(nowIso, 0)}T00:00:00Z`)) / 86_400_000);
}

/** POST /v1/fazendinha/bets: compra dos palpites de uma extração/modalidade/valor. */
export interface PlaceFazendinhaBetRequest {
  /** UUID gerado pelo cliente por tentativa de compra: repetir a mesma chave não compra de novo. */
  idempotencyKey: string;
  /** YYYY-MM-DD (Brasília). */
  drawDate: string;
  lottery: string;
  hour: number;
  mode: FazendinhaModeId;
  stakeCents: Cents;
  /**
   * Prêmio por número que o jogador viu na tela. Se a cotação da banca mudou desde então, a compra é
   * recusada (QUOTE_CHANGED) em vez de vender por um prêmio diferente do mostrado.
   */
  prizeCents: Cents;
  /** Palpites distintos, de 1 a FAZENDINHA_MAX_NUMBERS_PER_BET. */
  numbers: number[];
}

/** Pule (comprovante) de uma compra da Fazendinha. */
export interface PublicFazendinhaBet {
  /** Número do pule, exibido ao jogador. */
  puleNumber: number;
  drawDate: string;
  lottery: string;
  hour: number;
  mode: FazendinhaModeId;
  stakeCents: Cents;
  /** Prêmio de cada número, pela cotação vigente na compra. */
  prizeCents: Cents;
  /** Nome da tabela de cotação da banca na compra (ex.: 800/1/8000). */
  quoteTable: string;
  /** Em ordem crescente. */
  numbers: number[];
  totalCents: Cents;
  /** ISO 8601. */
  createdAt: string;
  /** Vendedor = o próprio jogador (displayId). */
  sellerId: number;
}

export interface PlaceFazendinhaBetResponse {
  bet: PublicFazendinhaBet;
  /** Carteira depois do débito. */
  wallet: PublicWallet;
}

/** GET /v1/fazendinha/sold?drawDate=YYYY-MM-DD: números já vendidos no dia, por extração/modalidade/valor. */
export interface FazendinhaSoldEntry {
  lottery: string;
  hour: number;
  mode: FazendinhaModeId;
  stakeCents: Cents;
  numbers: number[];
}
