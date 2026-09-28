/**
 * Fazendinha na tela. Modalidades, valores e regras de horário vêm de @sysjb/contracts, os mesmos que a API
 * usa para validar a compra; as extrações, do cadastro de sorteios da banca. Valores em centavos.
 */
import {
  type DrawSchedule,
  type FazendinhaMode,
  type FazendinhaModeId,
  type FazendinhaQuote,
  type FazendinhaSoldEntry,
  type PublicDraw,
  brasiliaNow,
  drawsOn,
  isDrawOpenOn,
} from '@sysjb/contracts';

export {
  FAZENDINHA_MAX_DAY_OFFSET,
  FAZENDINHA_MODES,
  type FazendinhaMode,
  type FazendinhaModeId,
  drawDateOf,
} from '@sysjb/contracts';

/** Extração da Fazendinha: um sorteio do cadastro que vale para ela. */
export type FazendinhaLottery = PublicDraw;

/** Nome no pule e na tela (ex.: LT PT RIO 09HS). */
export const lotteryLabel = (lottery: Pick<PublicDraw, 'name'>) => lottery.name;

/** Valores oferecidos na modalidade (os com prêmio na cotação da banca), do menor ao maior, com o prêmio. */
export const offeredStakes = (quotes: FazendinhaQuote[], mode: FazendinhaModeId) =>
  quotes
    .filter((q) => q.mode === mode && q.prizeCents > 0)
    .sort((a, b) => a.stakeCents - b.stakeCents)
    .map((q) => ({ stakeCents: q.stakeCents, prizeCents: q.prizeCents }));

const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'short' });

/** "Hoje - 28/09", "Amanhã - 29/09", "Qua - 30/09". */
export function dayLabel(nowIso: string, offset: number): string {
  const { year, month, day } = brasiliaNow(nowIso);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  const dm = `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  if (offset === 0) return `Hoje - ${dm}`;
  if (offset === 1) return `Amanhã - ${dm}`;
  const weekday = WEEKDAY.format(date).replace('.', '');
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} - ${dm}`;
}

/**
 * Extrações da data (YYYY-MM-DD) que ainda vendem em `nowIso` (hoje, só as antes do horário máximo de venda;
 * data que já passou, nenhuma), por horário e depois por nome. Busca ignora caixa e espaços nas pontas.
 */
export function openLotteries(schedule: DrawSchedule, nowIso: string, date: string, query = ''): FazendinhaLottery[] {
  const q = query.trim().toUpperCase();
  return drawsOn(schedule, date, 'fazendinha')
    .filter((draw) => isDrawOpenOn(nowIso, date, draw.closesAt) && (!q || lotteryLabel(draw).includes(q)))
    .sort((a, b) => a.drawTime.localeCompare(b.drawTime) || a.name.localeCompare(b.name));
}

/** Os 25 grupos do jogo do bicho, na ordem (grupo 1 = Avestruz … grupo 25 = Vaca). */
export const BICHOS = [
  'Avestruz',
  'Águia',
  'Burro',
  'Borboleta',
  'Cachorro',
  'Cabra',
  'Carneiro',
  'Camelo',
  'Cobra',
  'Coelho',
  'Cavalo',
  'Elefante',
  'Galo',
  'Gato',
  'Jacaré',
  'Leão',
  'Macaco',
  'Porco',
  'Pavão',
  'Peru',
  'Touro',
  'Tigre',
  'Urso',
  'Veado',
  'Vaca',
] as const;

export const bichoImage = (group: number) => `/fazendinha/bichos/${String(group).padStart(2, '0')}.webp`;

/**
 * Grupo (1–25) de um palpite: no grupo é o próprio número; na dezena e na centena vale o final de
 * dois dígitos, 4 dezenas por grupo (01–04 Avestruz … 97–00 Vaca, com 00 contando como 100).
 */
export function groupOf(mode: FazendinhaModeId, value: number): number {
  if (mode === 'grupo') return value;
  const tens = value % 100 || 100;
  return Math.ceil(tens / 4);
}

/** "01" (grupo e dezena) ou "001" (centena). */
export const palpiteLabel = (mode: FazendinhaModeId, value: number) =>
  String(value).padStart(mode === 'centena' ? 3 : 2, '0');

/**
 * Palpites da modalidade, na ordem da tela: grupos 1–25; dezenas 01–99 e 00 no fim (é do último
 * grupo); centenas da faixa escolhida (ex.: 100–199).
 */
export function palpiteValues(mode: FazendinhaModeId, hundred = 0): number[] {
  if (mode === 'grupo') return Array.from({ length: 25 }, (_, i) => i + 1);
  if (mode === 'dezena') return [...Array.from({ length: 99 }, (_, i) => i + 1), 0];
  return Array.from({ length: 100 }, (_, i) => hundred * 100 + i);
}

/** Aposta escolhida na lista (extração, modalidade e valor), usada na etapa de palpites. */
export interface FazendinhaTicket {
  /** Data da extração (YYYY-MM-DD), fixada na escolha: é a que vai na compra. */
  drawDate: string;
  /** Como o dia apareceu na lista ("Hoje - 28/09"). */
  dayLabel: string;
  lottery: FazendinhaLottery;
  mode: FazendinhaMode;
  stakeCents: number;
  /** Prêmio de cada número pela cotação da banca (a API confere de novo na compra). */
  prizeCents: number;
}

/** Chave de uma cartela: extração + modalidade + valor (cada número é vendido uma vez por cartela). */
export const soldKey = (lottery: Pick<PublicDraw, 'name' | 'hour'>, mode: FazendinhaModeId, stakeCents: number) =>
  `${lottery.name}|${lottery.hour}|${mode}|${stakeCents}`;

/** Números vendidos no dia, por cartela. */
export type SoldMap = Record<string, number[]>;

export function toSoldMap(entries: FazendinhaSoldEntry[]): SoldMap {
  return Object.fromEntries(
    entries.map((e) => [soldKey({ name: e.lottery, hour: e.hour }, e.mode, e.stakeCents), e.numbers]),
  );
}

/** Sigla da modalidade no comprovante ("FAZENDINHA GP"). */
export const MODE_CODE: Record<FazendinhaModeId, string> = { grupo: 'GP', dezena: 'DZ', centena: 'CT' };
