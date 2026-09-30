/**
 * Loterias (jogo do bicho, Tradicional): regras compartilhadas entre a tela e a API.
 * Uma aposta (item) = modalidade + colocação + palpites + valor. A compra vale para uma data e um ou mais
 * sorteios (cadastro da banca, draws.ts); cada sorteio gera um pule com todos os itens. Valores em centavos; horários em Brasília.
 *
 * A cotação vem da tabela da banca (quotes.ts): prêmio para cada R$ 1,00. Prêmio de um palpite =
 * valor do palpite × cotação ÷ R$ 1,00 ÷ divisor da colocação ÷ permutações (nas invertidas).
 */

import type { DrawGame } from './draws.js';
import type { Cents, PublicWallet } from './index.js';
import type { PublicQuotes, TraditionalQuoteModality } from './quotes.js';

/**
 * Jogos de loteria à venda. Mesmas modalidades e a mesma tabela de cotação; mudam as colocações (a 1/10 vai até o
 * 10º prêmio) e os sorteios (cada sorteio do cadastro diz em quais jogos vale). O pule grava o jogo.
 */
export const LOTTERY_GAMES = ['tradicional', 'tradicional_10'] as const;
export type LotteryGame = (typeof LOTTERY_GAMES)[number];

/** Jogo do cadastro de sorteios (draws.ts) que cada jogo de loteria usa. */
export const LOTTERY_GAME_DRAWS: Record<LotteryGame, DrawGame> = {
  tradicional: 'lotteries',
  tradicional_10: 'lotteries10',
};

/** Tipos de jogo da primeira tela. Os indisponíveis avisam "em breve". */
export const LOTTERY_GAME_TYPES = [
  { id: 'tradicional', label: 'Tradicional', description: 'Tradicionais 1/7', available: true },
  { id: 'tradicional_10', label: 'Tradicional 1/10', description: 'Oficiais 1/10', available: true },
  { id: 'uruguaia', label: 'Lot. Uruguaia', description: 'Uruguaia oficial', available: false },
  { id: 'quininha', label: 'Quininha', description: 'Loterias Caixa', available: false },
  { id: 'seninha', label: 'Seninha', description: 'Loterias Caixa', available: false },
  { id: 'super15', label: 'Super15', description: 'Loterias Caixa', available: false },
] as const;

export const isLotteryGame = (id: string): id is LotteryGame => (LOTTERY_GAMES as readonly string[]).includes(id);

/** Tipo de jogo de um pule (nome e descrição da primeira tela). */
export const lotteryGameType = (game: LotteryGame) => LOTTERY_GAME_TYPES.find((type) => type.id === game)!;

/** Nome do jogo no comprovante: "Tradicional 1/7" ou "Tradicional 1/10". */
export const LOTTERY_GAME_LABELS: Record<LotteryGame, string> = {
  tradicional: 'Tradicional 1/7',
  tradicional_10: 'Tradicional 1/10',
};

/**
 * Como a modalidade lê o palpite:
 * - number: um número (milhar, centena, dezena, unidade, grupo 01–25);
 * - inverted: o número em qualquer ordem (o valor é dividido entre as permutações distintas);
 * - milhar_centena: metade do valor na milhar, metade na centena;
 * - combo: vários grupos ou dezenas no mesmo palpite (duque, terno, quina…), colocação fixa.
 */
export type LotteryModalityKind = 'number' | 'inverted' | 'milhar_centena' | 'combo';

export interface LotteryModality {
  id: string;
  label: string;
  kind: LotteryModalityKind;
  /** Cotação da tabela da banca usada (a da modalidade base, nas derivadas). */
  quote: TraditionalQuoteModality;
  /** Dígitos de cada número (grupo e dezena: 2). */
  digits: number;
  /** Quantos números formam um palpite (1, ou N nos combos). */
  parts: number;
  /** Números são grupos (01–25). */
  groups?: true;
  /** Combos: única colocação aceita. */
  fixedPlacement?: string;
}

const n = (
  id: string,
  label: string,
  quote: TraditionalQuoteModality,
  digits: number,
  kind: LotteryModalityKind = 'number',
): LotteryModality => ({
  id,
  label,
  kind,
  quote,
  digits,
  parts: 1,
});

const combo = (
  id: string,
  label: string,
  quote: TraditionalQuoteModality,
  parts: number,
  groups: boolean,
  fixedPlacement: string,
): LotteryModality => ({
  id,
  label,
  kind: 'combo',
  quote,
  digits: 2,
  parts,
  fixedPlacement,
  ...(groups ? { groups: true as const } : {}),
});

/** Ordem da lista da tela de Modalidade. */
export const LOTTERY_MODALITIES: LotteryModality[] = [
  n('centena', 'CENTENA', 'centena', 3),
  n('centena_invertida', 'CENTENA INVERTIDA', 'centena', 3, 'inverted'),
  n('centena_esquerda', 'CENTENA ESQUERDA', 'centena', 3),
  n('centena_inv_esq', 'CENTENA INV ESQ', 'centena', 3, 'inverted'),
  n('milhar', 'MILHAR', 'milhar', 4),
  n('milhar_centena', 'MILHAR E CENTENA', 'milhar', 4, 'milhar_centena'),
  n('milhar_invertida', 'MILHAR INVERTIDO', 'milhar', 4, 'inverted'),
  n('unidade', 'UNIDADE', 'unidade', 1),
  n('dezena', 'DEZENA', 'dezena', 2),
  n('dezena_esq', 'DEZENA ESQ', 'dezena', 2),
  n('dezena_meio', 'DEZENA MEIO', 'dezena', 2),
  { ...n('grupo', 'GRUPO', 'grupo', 2), groups: true },
  combo('duque_dez', 'DUQUE DEZ', 'duque_dez', 2, false, 'p1_5'),
  combo('terno_dez', 'TERNO DEZ', 'terno_dez', 3, false, 'p1_5'),
  combo('terno_dez_seco', 'TERNO DEZ SECO', 'terno_dez_seco', 3, false, 'p1_3'),
  combo('duque_gp', 'DUQUE GP', 'duque_gp', 2, true, 'p1_5'),
  combo('terno_gp', 'TERNO GP', 'terno_gp', 3, true, 'p1_5'),
  combo('quadra_gp', 'QUADRA GP', 'quadra_gp', 4, true, 'p1_5'),
  combo('quina_gp_8_5', 'QUINA GP 8/5', 'quina_gp_8_5', 8, true, 'p1_5'),
  combo('sena_gp_10_6', 'SENA GP 10/6', 'sena_gp_10_6', 10, true, 'p1_5'),
  combo('passe_vai', 'PASSE VAI', 'passe_vai', 2, true, 'p1_2'),
  combo('passe_vai_vem', 'PASSE VAI VEM', 'passe_vai_vem', 2, true, 'p1_2'),
];

export interface LotteryPlacement {
  id: string;
  label: string;
  /** Prêmios que valem (1 = 1º prêmio). */
  positions: number[];
  /** Nos números: o valor vale para qualquer das posições, o prêmio é dividido por este número. */
  divisor: number;
  /** "1 e 1/5": metade do valor no 1º prêmio, metade no 1/5. */
  splitFirstAndFive?: true;
  badge?: { text: string; tone: 'green' | 'blue' };
}

const BADGES: Record<string, LotteryPlacement['badge']> = {
  p1: { text: 'Maior prêmio', tone: 'green' },
  p1_5: { text: '5x mais chances', tone: 'blue' },
  p1_10: { text: '10x mais chances', tone: 'blue' },
};

/**
 * Colocação pelo id: "p3" = só o 3º prêmio; "p2_5" = do 2º ao 5º (o prêmio é dividido pela quantidade de posições);
 * "p1_e_1_5" = metade do valor no 1º, metade no 1/5. Os ids nunca mudam: ficam gravados nos pules.
 */
function placementOf(id: string): LotteryPlacement {
  if (id === 'p1_e_1_5') {
    return { id, label: '1 e 1/5 PRÊMIO', positions: [1, 2, 3, 4, 5], divisor: 5, splitFirstAndFive: true };
  }
  const match = /^p(\d{1,2})(?:_(\d{1,2}))?$/.exec(id);
  if (!match) throw new Error(`colocação inválida: ${id}`);
  const from = Number(match[1]);
  const to = match[2] === undefined ? from : Number(match[2]);
  const positions = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const badge = BADGES[id];
  return {
    id,
    label: from === to ? `${from} PRÊMIO` : `${from}/${to} PRÊMIO`,
    positions,
    divisor: positions.length,
    ...(badge ? { badge } : {}),
  };
}

/** Faixas "de/até" do prêmio `from` até cada um de `tos`. */
const ranges = (from: number, tos: readonly number[]) => tos.map((to) => `p${from}_${to}`);

/** Colocações de cada jogo, na ordem da tela de Colocação. */
export const LOTTERY_GAME_PLACEMENTS: Record<LotteryGame, readonly string[]> = {
  tradicional: [
    'p1',
    'p1_5',
    'p1_e_1_5',
    'p2',
    'p3',
    'p4',
    'p5',
    'p6',
    ...ranges(1, [2, 3, 4, 6]),
    ...ranges(2, [3, 4, 5, 6]),
    ...ranges(3, [4, 5, 6]),
    ...ranges(4, [5, 6]),
    ...ranges(5, [6]),
  ],
  tradicional_10: [
    'p1',
    'p1_5',
    'p1_10',
    'p1_e_1_5',
    'p2',
    'p3',
    'p4',
    'p5',
    'p6',
    'p7',
    'p8',
    'p9',
    'p10',
    ...ranges(1, [2, 3, 4, 6, 7, 8, 9]),
    ...ranges(2, [3, 4, 5, 6, 7, 8, 9, 10]),
    ...ranges(3, [4, 5, 6, 7, 8, 9, 10]),
    ...ranges(4, [5, 6, 7, 8, 9, 10]),
    ...ranges(5, [6, 7, 8, 9, 10]),
    ...ranges(6, [7, 8, 10]),
    ...ranges(7, [8, 9, 10]),
    ...ranges(8, [9, 10]),
    ...ranges(9, [10]),
  ],
};

/** Todas as colocações de algum jogo (a busca pelo id vale para pules de qualquer jogo). */
export const LOTTERY_PLACEMENTS: LotteryPlacement[] = [
  ...new Set(LOTTERY_GAMES.flatMap((game) => LOTTERY_GAME_PLACEMENTS[game])),
].map(placementOf);

export const findLotteryModality = (id: string) => LOTTERY_MODALITIES.find((m) => m.id === id);
export const findLotteryPlacement = (id: string) => LOTTERY_PLACEMENTS.find((p) => p.id === id);

/**
 * Colocações aceitas no jogo, na ordem da tela. Os combos têm colocação fixa (a cotação já considera isso), que vale
 * nos dois jogos.
 */
export function placementsFor(modality: LotteryModality, game: LotteryGame = 'tradicional'): LotteryPlacement[] {
  const ids = LOTTERY_GAME_PLACEMENTS[game];
  if (modality.fixedPlacement) {
    return ids.includes(modality.fixedPlacement) ? [findLotteryPlacement(modality.fixedPlacement)!] : [];
  }
  return ids.map((id) => findLotteryPlacement(id)!);
}

/** Tamanho do palpite em dígitos (combos: todos os números juntos, ex.: "0512" = grupos 05 e 12). */
export const guessLength = (modality: LotteryModality) => modality.digits * modality.parts;

/** Números de um palpite (combos: pedaços de 2 dígitos). */
export const guessParts = (modality: LotteryModality, guess: string): string[] =>
  modality.parts === 1 ? [guess] : (guess.match(/\d{2}/g) ?? []);

/** Como mostrar o palpite: combos com hífen ("05-12"). */
export const formatGuess = (modality: LotteryModality, guess: string) => guessParts(modality, guess).join('-');

/** Palpite válido: dígitos no tamanho certo; grupos de 01 a 25; nos combos, números diferentes entre si. */
export function isValidLotteryGuess(modality: LotteryModality, guess: string): boolean {
  if (!new RegExp(`^\\d{${guessLength(modality)}}$`).test(guess)) return false;
  const parts = guessParts(modality, guess);
  if (modality.groups && parts.some((p) => Number(p) < 1 || Number(p) > 25)) return false;
  return new Set(parts).size === parts.length;
}

/** Palpite aleatório válido ("Surpresinha"). */
export function randomLotteryGuess(modality: LotteryModality, random: () => number = Math.random): string {
  for (;;) {
    const parts = Array.from({ length: modality.parts }, () =>
      modality.groups
        ? String(1 + Math.floor(random() * 25)).padStart(2, '0')
        : String(Math.floor(random() * 10 ** modality.digits)).padStart(modality.digits, '0'),
    );
    const guess = parts.join('');
    if (isValidLotteryGuess(modality, guess)) return guess;
  }
}

/** Permutações distintas dos dígitos (1234 → 24; 1123 → 12; 1111 → 1). */
export function distinctPermutations(guess: string): number {
  const factorial = (k: number): number => (k <= 1 ? 1 : k * factorial(k - 1));
  const counts = new Map<string, number>();
  for (const digit of guess) counts.set(digit, (counts.get(digit) ?? 0) + 1);
  let result = factorial(guess.length);
  for (const count of counts.values()) result /= factorial(count);
  return result;
}

/** "Todos" = o valor é dividido entre os palpites; "Cada" = o valor vale para cada palpite. */
export const LOTTERY_SPLITS = ['total', 'each'] as const;
export type LotterySplit = (typeof LOTTERY_SPLITS)[number];

/** Limites de uma compra. */
export const LOTTERY_LIMITS = {
  maxItems: 20,
  maxGuessesPerItem: 100,
  maxDraws: 20,
  /** Valor digitado num item: até R$ 10.000,00. */
  maxAmountCents: 1_000_000,
  /** Dias à frente (além de hoje) que aceitam apostas. */
  maxDayOffset: 6,
} as const;

/** Total do item em UMA extração. */
export const lotteryItemTotalCents = (amountCents: number, split: LotterySplit, guesses: number) =>
  split === 'each' ? amountCents * guesses : amountCents;

/**
 * Cotação efetiva do item (centavos de prêmio por R$ 1,00): a da modalidade base; em MILHAR E CENTENA, a
 * soma das duas (cada metade do valor vai para uma). A tela manda este número na compra e a API recusa
 * (QUOTE_CHANGED) se a banca mudou a tabela nesse meio-tempo. 0 = modalidade desligada.
 */
export function lotteryQuoteCents(modality: LotteryModality, quotes: Pick<PublicQuotes, 'traditional'>): number {
  const q = (id: string) => quotes.traditional.find((t) => t.modality === id)?.prizeCents ?? 0;
  if (modality.kind === 'milhar_centena') {
    const milhar = q('milhar');
    const centena = q('centena');
    return milhar > 0 && centena > 0 ? milhar + centena : 0;
  }
  return q(modality.quote);
}

/**
 * Maior prêmio possível do item numa extração (o do palpite que mais paga), arredondado para baixo no
 * centavo. Com "Todos", cada palpite vale valor ÷ quantidade de palpites.
 */
export function lotteryPossiblePrizeCents(
  modality: LotteryModality,
  placement: LotteryPlacement,
  guesses: string[],
  amountCents: number,
  split: LotterySplit,
  quoteCents: number,
): Cents {
  if (guesses.length === 0 || quoteCents <= 0) return 0;
  const perGuess = amountCents / (split === 'each' ? 1 : guesses.length);
  // Combos: a cotação já é da colocação fixa. Números: divisor da colocação; "1 e 1/5" soma as duas metades.
  const placementFactor =
    modality.kind === 'combo' ? 1 : placement.splitFirstAndFive ? (1 / 2) * (1 + 1 / 5) : 1 / placement.divisor;
  // MILHAR E CENTENA: metade do valor em cada; quem acerta a milhar acerta também a centena.
  const quoteFactor = modality.kind === 'milhar_centena' ? 1 / 2 : 1;
  const best = Math.max(
    ...guesses.map((guess) => {
      const perms = modality.kind === 'inverted' ? distinctPermutations(guess) : 1;
      return (perGuess * (quoteCents / 100) * quoteFactor * placementFactor) / perms;
    }),
  );
  // Folga contra erro de ponto flutuante antes de arredondar para baixo.
  return Math.floor(best + 1e-6);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export interface LotteryItemRequest {
  modality: string;
  placement: string;
  /** Palpites distintos, só dígitos (combos: números juntos, ex.: "0512"). */
  guesses: string[];
  /** Valor digitado (centavos): o total do item ("Todos") ou de cada palpite ("Cada"). */
  amountCents: Cents;
  split: LotterySplit;
  /** Cotação que o jogador viu (lotteryQuoteCents). Diferente da atual: QUOTE_CHANGED. */
  quoteCents: number;
}

/** POST /v1/lotteries/tickets: um pule por extração, todos com os mesmos itens. */
export interface PlaceLotteryTicketsRequest {
  /** UUID por tentativa de compra: repetir a mesma chave não compra de novo. */
  idempotencyKey: string;
  /** Jogo (colocações e sorteios aceitos). Ausente = Tradicional 1/7. */
  game?: LotteryGame;
  /** YYYY-MM-DD (Brasília). */
  drawDate: string;
  /** Sorteios do cadastro (nome e hora, como em PublicDraw). */
  draws: Array<{ name: string; hour: number }>;
  items: LotteryItemRequest[];
}

/**
 * POST /v1/lotteries/tickets/repeat: compra de novo as apostas de uma pule do próprio jogador (mesmos palpites,
 * valores e divisão), na data e nas loterias escolhidas, com a cotação de agora. Responde como a compra.
 */
export interface RepeatLotteryTicketRequest {
  /** UUID por tentativa: repetir a mesma chave não compra de novo. */
  idempotencyKey: string;
  /** Número da pule a repetir (Loterias; tem de ser do jogador da sessão). */
  puleNumber: number;
  /** Jogo escolhido na primeira etapa: tem de ser o da pule. Ausente = Tradicional 1/7. */
  game?: LotteryGame;
  /** YYYY-MM-DD (Brasília). */
  drawDate: string;
  draws: Array<{ name: string; hour: number }>;
}

/** Maior número de pule aceito na busca (int4 do banco). */
export const MAX_PULE_NUMBER = 2_147_483_647;

export interface PublicLotteryItem {
  modality: string;
  modalityLabel: string;
  placement: string;
  placementLabel: string;
  guesses: string[];
  amountCents: Cents;
  split: LotterySplit;
  /** Total do item neste pule. */
  totalCents: Cents;
  quoteCents: number;
  possiblePrizeCents: Cents;
}

/** Pule de uma extração. */
export interface PublicLotteryTicket {
  puleNumber: number;
  game: LotteryGame;
  drawDate: string;
  lottery: string;
  hour: number;
  items: PublicLotteryItem[];
  totalCents: Cents;
  /** Nome da tabela de cotação na compra (ex.: 800/1/8000). */
  quoteTable: string;
  /** ISO 8601. */
  createdAt: string;
  /** Vendedor = o próprio jogador (displayId). */
  sellerId: number;
}

export interface PlaceLotteryTicketsResponse {
  tickets: PublicLotteryTicket[];
  /** Soma de todos os pules. */
  totalCents: Cents;
  wallet: PublicWallet;
}
