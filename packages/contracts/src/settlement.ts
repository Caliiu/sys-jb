/**
 * Apuração: confere os pules contra o resultado da extração e calcula o prêmio. Os prêmios do resultado vêm do 1º em
 * diante, como o jogador vê (resultFullPrizes: nas loterias de 7 prêmios, o 6º é a soma e o 7º a multiplicação).
 *
 * Mesma conta do "Possível prêmio" do recibo (lotteryHitPrizeCents), em inteiros: cada acerto paga valor do palpite ×
 * cotação ÷ R$ 1,00 × fração da colocação ÷ permutações (nas invertidas), arredondado para baixo no centavo. O mesmo
 * palpite que sai em duas posições da colocação ganha duas vezes. Combos (duque, terno, quina…) ganham uma vez por
 * palpite, pela cotação da modalidade. Regras de cada modalidade: texto "Como jogar" da operação.
 */

import { type FazendinhaModeId, FAZENDINHA_MODES } from './fazendinha.js';
import {
  type LotteryModality,
  type LotterySplit,
  distinctPermutations,
  findLotteryModality,
  findLotteryPlacement,
  guessParts,
  lotteryHitPrizeCents,
  placementShare,
} from './lotteries.js';
import { resultGroupOf } from './results.js';

/** Item sem regra de apuração (modalidade ou colocação desconhecida): o pule fica pendente, nunca é dado como perdido. */
export class SettlementRuleError extends Error {}

/** Números de um prêmio sorteado. */
interface DrawnNumber {
  /** Os 4 últimos dígitos (a Federal tem 5); null no 7º prêmio das loterias de 7, que é só uma centena. */
  milhar: string | null;
  centena: string;
  dezena: string;
  unidade: string;
  group: number;
}

const drawnNumber = (number: string): DrawnNumber => ({
  milhar: number.length >= 4 ? number.slice(-4) : null,
  centena: number.slice(-3),
  dezena: number.slice(-2),
  unidade: number.slice(-1),
  group: resultGroupOf(number),
});

/** Mesmos dígitos em qualquer ordem. */
const sameDigits = (a: string, b: string) => a.length === b.length && [...a].sort().join('') === [...b].sort().join('');

/** Acerto de um palpite das modalidades de um número (exceto MILHAR E CENTENA) num prêmio sorteado. */
function numberHit(modality: LotteryModality, guess: string, n: DrawnNumber): boolean {
  switch (modality.id) {
    case 'milhar':
      return n.milhar === guess;
    case 'milhar_invertida':
      return n.milhar !== null && sameDigits(n.milhar, guess);
    case 'centena':
      return n.centena === guess;
    case 'centena_invertida':
      return sameDigits(n.centena, guess);
    case 'centena_esquerda':
      return n.milhar !== null && n.milhar.slice(0, 3) === guess;
    case 'centena_inv_esq':
      return n.milhar !== null && sameDigits(n.milhar.slice(0, 3), guess);
    case 'dezena':
      return n.dezena === guess;
    case 'dezena_esq':
      return n.milhar !== null && n.milhar.slice(0, 2) === guess;
    case 'dezena_meio':
      return n.milhar !== null && n.milhar.slice(1, 3) === guess;
    case 'unidade':
      return n.unidade === guess;
    case 'grupo':
      return n.group === Number(guess);
    default:
      throw new SettlementRuleError(`modalidade sem regra de apuração: ${modality.id}`);
  }
}

/**
 * Combos: "set" = quantos números do palpite precisam sair nas posições da modalidade (dezenas ou grupos, cada um
 * contado uma vez); "passe" = um grupo no 1º prêmio e o outro nas demais posições (Vai: na ordem do palpite; Vai e
 * Vem: em qualquer ordem).
 */
type ComboRule = { kind: 'set'; of: 'dezena' | 'group'; hits: number } | { kind: 'passe'; anyOrder: boolean };

const COMBO_RULES: Record<string, ComboRule> = {
  duque_dez: { kind: 'set', of: 'dezena', hits: 2 },
  terno_dez: { kind: 'set', of: 'dezena', hits: 3 },
  terno_dez_seco: { kind: 'set', of: 'dezena', hits: 3 },
  duque_gp: { kind: 'set', of: 'group', hits: 2 },
  terno_gp: { kind: 'set', of: 'group', hits: 3 },
  quadra_gp: { kind: 'set', of: 'group', hits: 4 },
  quina_gp_8_5: { kind: 'set', of: 'group', hits: 5 },
  sena_gp_10_6: { kind: 'set', of: 'group', hits: 6 },
  passe_vai: { kind: 'passe', anyOrder: false },
  passe_vai_vem: { kind: 'passe', anyOrder: true },
};

function comboWins(rule: ComboRule, guess: string, modality: LotteryModality, drawn: DrawnNumber[]): boolean {
  const parts = guessParts(modality, guess);
  if (rule.kind === 'set') {
    const out = new Set(drawn.map((n) => (rule.of === 'group' ? String(n.group).padStart(2, '0') : n.dezena)));
    return parts.filter((part) => out.has(part)).length >= rule.hits;
  }
  const [first, ...others] = drawn;
  const rest = new Set(others.map((n) => n.group));
  const [a, b] = parts.map(Number) as [number, number];
  return (first!.group === a && rest.has(b)) || (rule.anyOrder && first!.group === b && rest.has(a));
}

/** Item de um pule de Loterias, como gravado na venda. */
export interface LotterySettlementItem {
  /** Ordem do item no pule (1 em diante). */
  position: number;
  modality: string;
  placement: string;
  guesses: readonly string[];
  amountCents: number;
  split: LotterySplit;
  /** Cotação gravada no item (na MILHAR E CENTENA, a soma das duas). */
  quoteCents: number;
  /** Só na MILHAR E CENTENA: a cotação da centena gravada na venda. */
  centenaQuoteCents: number | null;
}

/** Item premiado: os palpites que ganharam e o prêmio do item. */
export interface ItemPrize {
  position: number;
  guesses: string[];
  prizeCents: number;
}

function modalityOf(id: string): LotteryModality {
  const modality = findLotteryModality(id);
  if (!modality) throw new SettlementRuleError(`modalidade desconhecida: ${id}`);
  return modality;
}

/**
 * Posições do resultado (1 = 1º prêmio) que o item confere: as da colocação gravada; nos combos, as da colocação da
 * modalidade (regra atual, que vale também para pules antigos de Sena 1/5 e Passe 1/2).
 */
export function lotteryItemPositions(item: Pick<LotterySettlementItem, 'modality' | 'placement'>): number[] {
  const modality = modalityOf(item.modality);
  const placement = findLotteryPlacement(modality.fixedPlacement ?? item.placement);
  if (!placement) throw new SettlementRuleError(`colocação desconhecida: ${item.placement}`);
  return placement.positions;
}

/** Confere um item contra os prêmios sorteados (do 1º em diante). null = item sem prêmio. */
export function settleLotteryItem(item: LotterySettlementItem, prizes: readonly string[]): ItemPrize | null {
  const modality = modalityOf(item.modality);
  const positions = lotteryItemPositions(item);
  if (prizes.length < Math.max(...positions)) throw new SettlementRuleError('resultado sem todas as posições');
  const guessCount = item.guesses.length;
  const won: Array<{ guess: string; prizeCents: number }> = [];

  if (modality.kind === 'combo') {
    const rule = COMBO_RULES[modality.id];
    if (!rule) throw new SettlementRuleError(`modalidade sem regra de apuração: ${modality.id}`);
    const drawn = positions.map((p) => drawnNumber(prizes[p - 1]!));
    // A cotação já é da colocação fixa: um prêmio por palpite premiado.
    const prize = lotteryHitPrizeCents(item.amountCents, item.split, guessCount, item.quoteCents, { num: 1, den: 1 });
    for (const guess of item.guesses) {
      if (comboWins(rule, guess, modality, drawn)) won.push({ guess, prizeCents: prize });
    }
  } else {
    const placement = findLotteryPlacement(item.placement)!;
    if (modality.kind === 'milhar_centena' && !(item.centenaQuoteCents && item.centenaQuoteCents > 0)) {
      throw new SettlementRuleError('MILHAR E CENTENA sem a cotação da centena');
    }
    for (const guess of item.guesses) {
      let prizeCents = 0;
      for (const position of positions) {
        const n = drawnNumber(prizes[position - 1]!);
        const share = placementShare(placement, position);
        if (modality.kind === 'milhar_centena') {
          // Metade do valor na milhar e metade na centena: acertou a milhar, ganha as duas; só a centena, a metade dela.
          const quote =
            n.milhar === guess ? item.quoteCents : n.centena === guess.slice(1) ? item.centenaQuoteCents! : 0;
          prizeCents += lotteryHitPrizeCents(item.amountCents, item.split, guessCount, quote, {
            num: share.num,
            den: share.den * 2,
          });
        } else if (numberHit(modality, guess, n)) {
          const perms = modality.kind === 'inverted' ? distinctPermutations(guess) : 1;
          prizeCents += lotteryHitPrizeCents(item.amountCents, item.split, guessCount, item.quoteCents, share, perms);
        }
      }
      if (prizeCents > 0) won.push({ guess, prizeCents });
    }
  }

  if (won.length === 0) return null;
  return {
    position: item.position,
    guesses: won.map((w) => w.guess),
    prizeCents: won.reduce((sum, w) => sum + w.prizeCents, 0),
  };
}

export type TicketSettlement =
  /** O resultado ainda não tem todas as posições de que o pule precisa (ex.: o 6º prêmio): conferir depois. */
  { status: 'incomplete' } | { status: 'settled'; prizeCents: number; items: ItemPrize[] };

/** Confere um pule de Loterias inteiro. */
export function settleLotteryTicket(
  items: readonly LotterySettlementItem[],
  prizes: readonly string[],
): TicketSettlement {
  const needed = Math.max(...items.map((item) => Math.max(...lotteryItemPositions(item))));
  if (items.length === 0 || prizes.length < needed) return { status: 'incomplete' };
  const won = items.flatMap((item) => settleLotteryItem(item, prizes) ?? []);
  return { status: 'settled', prizeCents: won.reduce((sum, item) => sum + item.prizeCents, 0), items: won };
}

/** Palpite da Fazendinha como no comprovante: grupo e dezena com 2 dígitos, centena com 3. */
export const fazendinhaGuess = (mode: FazendinhaModeId, number: number) =>
  String(number).padStart(mode === 'centena' ? 3 : 2, '0');

/**
 * Confere um pule da Fazendinha: vale só o 1º prêmio (a cabeça), e cada número foi vendido uma vez, então no máximo um
 * palpite ganha, pelo prêmio gravado na compra. Resultado sem prêmios: pendente.
 */
export function settleFazendinhaBet(
  bet: { mode: FazendinhaModeId; numbers: readonly number[]; prizeCents: number },
  prizes: readonly string[],
): TicketSettlement {
  if (!FAZENDINHA_MODES.some((m) => m.id === bet.mode)) throw new SettlementRuleError(`modalidade: ${bet.mode}`);
  const head = prizes[0];
  if (!head) return { status: 'incomplete' };
  const n = drawnNumber(head);
  const value = bet.mode === 'grupo' ? n.group : Number(bet.mode === 'dezena' ? n.dezena : n.centena);
  if (!bet.numbers.includes(value)) return { status: 'settled', prizeCents: 0, items: [] };
  return {
    status: 'settled',
    prizeCents: bet.prizeCents,
    items: [{ position: 1, guesses: [fazendinhaGuess(bet.mode, value)], prizeCents: bet.prizeCents }],
  };
}
