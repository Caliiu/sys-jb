/**
 * Cotações da banca: quanto cada aposta paga. O Gerente edita no painel; enquanto não edita, valem os
 * padrões abaixo (os da tabela de referência 800/1/8000). Prêmio R$ 0,00 = opção desligada.
 * Valores em centavos.
 */

import { FAZENDINHA_MODES, FAZENDINHA_STAKES_CENTS, type FazendinhaModeId } from './fazendinha.js';

/** Jogos com tabela de cotação editável (os outros tipos ainda não existem no sistema). */
export const QUOTE_GAMES = ['tradicional', 'fazendinha'] as const;
export type QuoteGame = (typeof QUOTE_GAMES)[number];

/** Maior prêmio configurável num item da tabela: R$ 1.000.000,00. */
export const MAX_QUOTE_PRIZE_CENTS = 100_000_000;

/** Tradicional: prêmio para cada R$ 1,00 apostado, por modalidade (ordem da tabela). */
export const TRADITIONAL_QUOTE_MODALITIES = [
  { id: 'unidade', label: 'UNIDADE', defaultPrizeCents: 800 },
  { id: 'grupo', label: 'GRUPO', defaultPrizeCents: 2_000 },
  { id: 'dezena', label: 'DEZENA', defaultPrizeCents: 8_000 },
  { id: 'centena', label: 'CENTENA', defaultPrizeCents: 80_000 },
  { id: 'milhar', label: 'MILHAR', defaultPrizeCents: 800_000 },
  { id: 'duque_gp', label: 'DUQUE GP', defaultPrizeCents: 18_000 },
  { id: 'terno_gp', label: 'TERNO GP', defaultPrizeCents: 180_000 },
  { id: 'quadra_gp', label: 'QUADRA GP', defaultPrizeCents: 100_000 },
  { id: 'quina_gp_8_5', label: 'QUINA GP 8/5', defaultPrizeCents: 60_000 },
  { id: 'sena_gp_10_6', label: 'SENA GP 10/6', defaultPrizeCents: 60_000 },
  { id: 'duque_dez', label: 'DUQUE DEZ', defaultPrizeCents: 30_000 },
  { id: 'terno_dez_seco', label: 'TERNO DEZ SECO', defaultPrizeCents: 1_000_000 },
  { id: 'terno_dez', label: 'TERNO DEZ', defaultPrizeCents: 500_000 },
  { id: 'palpitao', label: 'PALPITAO', defaultPrizeCents: 80_000 },
  { id: 'passe_vai', label: 'PASSE VAI', defaultPrizeCents: 9_000 },
  { id: 'passe_vai_vem', label: 'PASSE VAI VEM', defaultPrizeCents: 4_500 },
] as const;
export type TraditionalQuoteModality = (typeof TRADITIONAL_QUOTE_MODALITIES)[number]['id'];

/** Sigla da modalidade da Fazendinha na tabela ("FAZENDINHA GP-1"). */
export const FAZENDINHA_MODE_CODES: Record<FazendinhaModeId, string> = { grupo: 'GP', dezena: 'DZ', centena: 'CT' };

/** Valores de aposta da Fazendinha na tabela (R$ 1 a R$ 100). */
export const FAZENDINHA_QUOTE_STAKES_CENTS = FAZENDINHA_STAKES_CENTS;

/** Padrão da Fazendinha: valor × cotação da modalidade (22 / 88 / 880); CT-100 desligado, como na referência. */
export function defaultFazendinhaPrizeCents(mode: FazendinhaModeId, stakeCents: number): number {
  if (mode === 'centena' && stakeCents === 10000) return 0;
  return stakeCents * FAZENDINHA_MODES.find((m) => m.id === mode)!.multiplier;
}

export interface TraditionalQuote {
  modality: TraditionalQuoteModality;
  label: string;
  /** Prêmio para cada R$ 1,00 apostado. 0 = desligada. */
  prizeCents: number;
}

export interface FazendinhaQuote {
  mode: FazendinhaModeId;
  stakeCents: number;
  /** Prêmio de cada número. 0 = este valor não é oferecido. */
  prizeCents: number;
}

/** GET /v1/quotes (jogador) e GET /v1/admin/quotes (painel). */
export interface PublicQuotes {
  /** Nome da tabela: "centena/1/milhar" (ex.: 800/1/8000). */
  tableLabel: string;
  traditional: TraditionalQuote[];
  fazendinha: FazendinhaQuote[];
}

/**
 * PUT /v1/admin/quotes/tradicional: só os itens alterados (cada modalidade no máximo uma vez). Parcial de
 * propósito: dois gerentes editando ao mesmo tempo não desfazem a alteração um do outro.
 */
export interface SetTraditionalQuotesRequest {
  quotes: Array<{ modality: TraditionalQuoteModality; prizeCents: number }>;
}

/** PUT /v1/admin/quotes/fazendinha: só os itens alterados (cada modalidade × valor no máximo uma vez). */
export interface SetFazendinhaQuotesRequest {
  quotes: Array<{ mode: FazendinhaModeId; stakeCents: number; prizeCents: number }>;
}

/** "800/1/8000": cotação da centena / R$ 1 / cotação da milhar (em reais, sem centavos quando inteiro). */
export function quoteTableLabel(traditional: Array<Pick<TraditionalQuote, 'modality' | 'prizeCents'>>): string {
  const value = (id: string) => {
    const cents = traditional.find((q) => q.modality === id)?.prizeCents ?? 0;
    return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',');
  };
  return `${value('centena')}/1/${value('milhar')}`;
}

/** Tabela padrão (sem nada salvo pela banca). */
export function defaultQuotes(): PublicQuotes {
  const traditional = TRADITIONAL_QUOTE_MODALITIES.map((m) => ({
    modality: m.id,
    label: m.label,
    prizeCents: m.defaultPrizeCents,
  }));
  const fazendinha = FAZENDINHA_MODES.flatMap((mode) =>
    FAZENDINHA_QUOTE_STAKES_CENTS.map((stakeCents) => ({
      mode: mode.id,
      stakeCents,
      prizeCents: defaultFazendinhaPrizeCents(mode.id, stakeCents),
    })),
  );
  return { tableLabel: quoteTableLabel(traditional), traditional, fazendinha };
}

/** Prêmio de um número da Fazendinha na tabela (0 = valor não oferecido). */
export const fazendinhaPrizeFrom = (
  quotes: Pick<PublicQuotes, 'fazendinha'>,
  mode: FazendinhaModeId,
  stakeCents: number,
) => quotes.fazendinha.find((q) => q.mode === mode && q.stakeCents === stakeCents)?.prizeCents ?? 0;
