/**
 * Loterias na tela: dias, carrinho e totais. Modalidades, cotações e regras de prêmio vêm de @sysjb/contracts
 * (as mesmas que a API usa para validar a compra); os sorteios, do cadastro da banca. Valores em centavos.
 */
import {
  type DrawGame,
  type DrawSchedule,
  LOTTERY_LIMITS,
  type LotteryModality,
  type LotteryPlacement,
  type LotterySplit,
  type PublicDraw,
  WEEKDAY_LABELS as WEEKDAYS,
  drawDateOf,
  drawsOn,
  lotteryItemTotalCents,
  lotteryPossiblePrizeCents,
} from '@sysjb/contracts';

export interface LotteryDay {
  offset: number;
  /** YYYY-MM-DD. */
  date: string;
  /** "28/09/2026". */
  label: string;
  /** "Hoje" ou o dia da semana ("Terça"). */
  weekday: string;
  /** Título do cartão: "Hoje", "Amanhã" ou o dia da semana. */
  title: string;
  /** Dia do mês ("28"). */
  dayOfMonth: string;
  /** Tem sorteio da Loteria Federal (nome com FEDERAL) nesse dia. */
  hasFederal: boolean;
}

/** Hoje e os próximos dias que aceitam apostas (Brasília). `game`: jogo do cadastro de sorteios (a Federal é da 1/7). */
export function lotteryDays(nowIso: string, schedule: DrawSchedule, game: DrawGame = 'lotteries'): LotteryDay[] {
  return Array.from({ length: LOTTERY_LIMITS.maxDayOffset + 1 }, (_, offset) => {
    const date = drawDateOf(nowIso, offset);
    const [y, m, d] = date.split('-');
    const name = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
    const weekday = offset === 0 ? 'Hoje' : name;
    const title = offset === 0 ? 'Hoje' : offset === 1 ? 'Amanhã' : name;
    return {
      offset,
      date,
      label: `${d}/${m}/${y}`,
      weekday,
      title,
      dayOfMonth: String(Number(d)),
      hasFederal: drawsOn(schedule, date, game).some((draw) => draw.name.includes('FEDERAL')),
    };
  });
}

/** Dia da semana mesmo quando é hoje (para os resumos: "Terça"). */
export const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!;

export const drawKey = (draw: Pick<PublicDraw, 'name' | 'hour'>) => `${draw.name}|${draw.hour}`;

/** Aposta no carrinho. */
export interface CartItem {
  modality: LotteryModality;
  placement: LotteryPlacement;
  guesses: string[];
  amountCents: number;
  split: LotterySplit;
  /** Cotação que o jogador viu (vai na compra; a API recusa se mudou). */
  quoteCents: number;
}

/** Total do item em uma extração. */
export const itemTotal = (item: CartItem) => lotteryItemTotalCents(item.amountCents, item.split, item.guesses.length);

export const itemPossiblePrize = (item: CartItem) =>
  lotteryPossiblePrizeCents(item.modality, item.placement, item.guesses, item.amountCents, item.split, item.quoteCents);

/** Total da compra: soma dos itens × quantidade de extrações. */
export const cartTotal = (items: CartItem[], draws: number) =>
  items.reduce((sum, item) => sum + itemTotal(item), 0) * Math.max(draws, 1);

/** "8000x", "18,5x" (cotação em centavos por R$ 1,00). */
export function quoteBadge(quoteCents: number): string {
  const value = quoteCents / 100;
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace('.', ',').replace(/0$/, '')}x`;
}

export const FAVORITES_KEY = 'sysjb:lottery-favorites';
