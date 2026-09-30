/**
 * Resultados das loterias, recebidos do provedor (Loteria Integrada): valem para todas as bancas. Cada resultado é
 * identificado por data (Brasília) + sigla da loteria + extração (hora, 0–23). Algumas siglas são compartilhadas por
 * loterias diferentes e só a extração as distingue (ex.: "sp" 15 = Bandeirantes).
 */

/** Loterias do provedor, na ordem da tela de resultados. */
export const RESULT_LOTTERIES = [
  { code: 'rj', name: 'PT Rio de Janeiro', extractions: [9, 11, 14, 16, 18, 21] },
  { code: 'mrj', name: 'Maluquinha Rio de Janeiro', extractions: [9, 11, 14, 16, 18, 21] },
  { code: 'fd', name: 'Loteria Federal', extractions: [19] },
  { code: 'ln', name: 'Loteria Nacional', extractions: [2, 8, 10, 12, 15, 17, 20, 23] },
  { code: 'lk', name: 'Look Goiás', extractions: [7, 9, 11, 14, 16, 18, 21, 23] },
  { code: 'bs', name: 'Boa Sorte Goiás', extractions: [9, 11, 14, 16, 18, 21] },
  { code: 'sp', name: 'PT São Paulo', extractions: [8, 10, 12, 13, 17, 19, 20] },
  { code: 'sp', name: 'Bandeirantes São Paulo', extractions: [15] },
  { code: 'pb', name: 'PT Paraíba', extractions: [9, 20] },
  { code: 'pb', name: 'Lotep Paraíba', extractions: [10, 12, 15, 18] },
  { code: 'ba', name: 'PT Bahia', extractions: [10, 12, 15, 19, 21] },
  { code: 'mba', name: 'Maluca Bahia', extractions: [10, 12, 15, 19, 21] },
  { code: 'mg', name: 'União Juiz de Fora', extractions: [11] },
  { code: 'mg', name: 'Salvação Minas', extractions: [13] },
  { code: 'mg', name: 'Minas Dia/Noite', extractions: [15, 19] },
  { code: 'lbr', name: 'LBR Brasília', extractions: [8, 10, 12, 15, 17, 19, 20, 22, 23] },
  { code: 'rs', name: 'Bicho RS', extractions: [14, 18] },
  { code: 'lp', name: 'Loteria Popular', extractions: [9, 11, 12, 14, 15, 17, 18] },
  { code: 'cs', name: 'Caminho da Sorte', extractions: [9, 11, 12, 14, 15, 17, 18, 20, 21] },
  { code: 'ls', name: 'Loteria Sertão', extractions: [9, 11, 13, 14, 16, 17, 18] },
  { code: 'mc', name: 'Monte Carlos', extractions: [10, 11, 12, 14, 15, 17, 18, 20] },
  { code: 'ao', name: 'Aliança Online', extractions: [9, 11, 12, 14, 15, 17, 18, 20] },
  { code: 'ev', name: 'Extração do Vale', extractions: [11, 13, 14, 16, 17, 18, 20] },
  { code: 'av', name: 'Aval', extractions: [9, 11, 12, 14, 15, 17, 18] },
  { code: 'ab', name: 'Abaese', extractions: [13, 14, 16, 19] },
] as const satisfies ReadonlyArray<{ code: string; name: string; extractions: readonly number[] }>;

/** Sigla da loteria no provedor: 2 a 4 letras minúsculas (aceita siglas novas, fora do catálogo). */
export const RESULT_LOTTERY_CODE_PATTERN = /^[a-z]{2,4}$/;

/** Prêmios de um resultado: do 1º ao 5º sempre; até o 10º em algumas loterias. */
export const RESULT_PRIZES = { min: 5, max: 10 } as const;

/** Número sorteado em cada prêmio: milhar (4 dígitos) ou, na Federal, até 5. */
export const RESULT_NUMBER_PATTERN = /^\d{4,5}$/;

/** Dias para trás (além de hoje) consultáveis pelo jogador. */
export const RESULTS_DAYS_BACK = 7;

const catalogIndex = (lottery: string, extraction: number) =>
  RESULT_LOTTERIES.findIndex(
    (entry) => entry.code === lottery && (entry.extractions as readonly number[]).includes(extraction),
  );

/** Extrações da sigla no catálogo, em ordem (siglas compartilhadas somam as de cada loteria); null = fora do catálogo. */
export function resultExtractionsOf(lottery: string): number[] | null {
  const entries = RESULT_LOTTERIES.filter((entry) => entry.code === lottery);
  if (entries.length === 0) return null;
  return [...new Set(entries.flatMap((entry) => entry.extractions as readonly number[]))].sort((a, b) => a - b);
}

/** Nome da loteria (pelo catálogo); fora dele, a sigla em maiúsculas. */
export function resultLotteryName(lottery: string, extraction: number): string {
  const index = catalogIndex(lottery, extraction);
  return index >= 0 ? RESULT_LOTTERIES[index]!.name : lottery.toUpperCase();
}

/** Ordem da tela: catálogo primeiro, depois siglas desconhecidas (alfabética), e por extração. */
export function compareResults(
  a: Pick<PublicLotteryResult, 'lottery' | 'extraction'>,
  b: Pick<PublicLotteryResult, 'lottery' | 'extraction'>,
): number {
  const rank = (r: typeof a) => {
    const index = catalogIndex(r.lottery, r.extraction);
    return index >= 0 ? index : RESULT_LOTTERIES.length;
  };
  return rank(a) - rank(b) || a.lottery.localeCompare(b.lottery) || a.extraction - b.extraction;
}

/** Grupo do bicho (1–25) de um número sorteado: pelos dois últimos dígitos, 4 dezenas por grupo (00 = 25). */
export function resultGroupOf(number: string): number {
  const tens = Number(number.slice(-2)) || 100;
  return Math.ceil(tens / 4);
}

/** Loterias do catálogo com 10 prêmios sorteados (Paraíba e Bahia): o 6º e o 7º não são calculados. */
const TEN_PRIZE_LOTTERIES: ReadonlySet<string> = new Set(['pb', 'ba', 'mba']);

/**
 * Prêmios completos do resultado. As loterias de 7 prêmios sorteiam 5; o provedor manda o 6º e o 7º já calculados
 * (Soma e Multiplicação), que viram prêmios pela regra do jogo:
 * - 6º = soma dos 5 primeiros, últimos 4 dígitos (25491 -> "5491");
 * - 7º = 1º × 2º, a centena do milhar (7977 × 5765 = 45.987.405 -> "987").
 * Resultado que já veio com mais de 5 prêmios, loteria de 10 prêmios ou fora do catálogo: como veio.
 */
export function resultFullPrizes(
  result: Pick<PublicLotteryResult, 'lottery' | 'extraction' | 'prizes' | 'sum' | 'multiplication'>,
): string[] {
  if (result.prizes.length !== 5 || TEN_PRIZE_LOTTERIES.has(result.lottery)) return result.prizes;
  if (catalogIndex(result.lottery, result.extraction) < 0 || !result.sum) return result.prizes;
  const sixth = result.sum.slice(-4).padStart(4, '0');
  const seventh = result.multiplication ? result.multiplication.slice(-3).padStart(3, '0') : null;
  return seventh ? [...result.prizes, sixth, seventh] : [...result.prizes, sixth];
}

/** "09h": extração com 2 dígitos. */
export const extractionLabel = (extraction: number) => `${String(extraction).padStart(2, '0')}h`;

/** Resultado do provedor que vale para um sorteio da banca: sigla + extração (a hora do provedor, não a da banca). */
export interface ResultSource {
  lottery: string;
  extraction: number;
}

/** Sigla + extração existe no catálogo (é o que o cadastro do sorteio aceita). */
export const isResultSource = (source: ResultSource) => catalogIndex(source.lottery, source.extraction) >= 0;

/** Opções do cadastro, por loteria do catálogo: "PT Rio de Janeiro" -> 09h, 11h... */
export const RESULT_SOURCE_OPTIONS = RESULT_LOTTERIES.map((entry) => ({
  name: entry.name,
  sources: entry.extractions.map((extraction) => ({ lottery: entry.code, extraction }) as ResultSource),
}));

/** "PT Rio de Janeiro 09h". */
export const resultSourceLabel = (source: ResultSource) =>
  `${resultLotteryName(source.lottery, source.extraction)} ${extractionLabel(source.extraction)}`;

/** Resultado do sorteio no dia (entre os resultados da data); null = sem ligação ou ainda sem resultado. */
export function resultOfDraw<T extends Pick<PublicLotteryResult, 'lottery' | 'extraction'>>(
  results: readonly T[],
  source: ResultSource | null,
): T | null {
  if (!source) return null;
  return results.find((r) => r.lottery === source.lottery && r.extraction === source.extraction) ?? null;
}

export interface PublicLotteryResult {
  /** Sigla do provedor (ex.: rj). */
  lottery: string;
  /** Nome pelo catálogo (ex.: PT Rio de Janeiro). */
  lotteryName: string;
  /** Extração (hora do sorteio, 0–23). */
  extraction: number;
  /**
   * Números do 1º prêmio em diante (4 dígitos; 5 na Federal). Nas loterias de 7 prêmios, o 6º (soma, 4 dígitos) e o
   * 7º (multiplicação, 3 dígitos) já vêm calculados (resultFullPrizes).
   */
  prizes: string[];
  /** Campos calculados pelo provedor, quando informados. */
  sum: string | null;
  multiplication: string | null;
  skipped: string | null;
  super5: string | null;
  /** Quando o resultado atual foi recebido (ISO 8601). */
  updatedAt: string;
}

/** GET /v1/results?date=: resultados do dia (YYYY-MM-DD, Brasília), na ordem da tela. */
export interface LotteryResultsResponse {
  date: string;
  results: PublicLotteryResult[];
}
