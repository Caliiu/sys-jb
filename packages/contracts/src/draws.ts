/**
 * Sorteios (extrações) da banca: uma lista só, cadastrada no painel, que vale para Loterias e/ou Fazendinha.
 * Cada sorteio corre nos dias da semana dele, salvo exceções de data (cancelado/feriado ou extra), e aceita
 * apostas até o horário máximo de venda. Horários "HH:MM" em Brasília. O banco confere tudo de novo na venda.
 */

import { brasiliaNow, dayOffsetOf } from './fazendinha.js';

export const DRAW_GAMES = ['lotteries', 'fazendinha'] as const;
export type DrawGame = (typeof DRAW_GAMES)[number];

export const DRAW_GAME_LABELS: Record<DrawGame, string> = { lotteries: 'Loterias', fazendinha: 'Fazendinha' };

/** Dias da semana (0 = domingo). */
export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

/** Dias à frente (além de hoje) que aceitam apostas. */
export const DRAW_MAX_DAY_OFFSET = 6;

export const DRAW_LIMITS = { groupMax: 30, nameMax: 40, codeMax: 12, noteMax: 80, sortOrderMax: 100_000 } as const;

/** Código curto da extração nos relatórios (ex.: PT14): letras maiúsculas e dígitos. */
export const DRAW_CODE_PATTERN = /^[A-Z0-9]{1,12}$/;

/** Sorteio como o jogador vê (só os ativos). */
export interface PublicDraw {
  id: string;
  /** Grupo da tela (ex.: RIO/FEDERAL). */
  group: string;
  /** Nome no pule e na tela (ex.: LT PT RIO 09HS). */
  name: string;
  /** Hora do sorteio (0–23): junto com o nome, identifica o sorteio no pule. */
  hour: number;
  /** Horário do sorteio (HH:MM). */
  drawTime: string;
  /** Horário máximo de venda (HH:MM). */
  closesAt: string;
  /** Dias da semana em que corre (0 = domingo … 6 = sábado). */
  weekdays: number[];
  games: DrawGame[];
}

export const DRAW_EXCEPTION_KINDS = ['CANCEL', 'EXTRA'] as const;
export type DrawExceptionKind = (typeof DRAW_EXCEPTION_KINDS)[number];

export const DRAW_EXCEPTION_LABELS: Record<DrawExceptionKind, string> = {
  CANCEL: 'Sem sorteio',
  EXTRA: 'Sorteio extra',
};

/** Exceção de data: CANCEL sem sorteio = o dia todo (feriado); EXTRA = corre fora dos dias da semana dele. */
export interface PublicDrawException {
  /** YYYY-MM-DD. */
  date: string;
  drawId: string | null;
  kind: DrawExceptionKind;
}

/** GET /v1/draws: sorteios ativos e as exceções de hoje até o fim da janela de apostas. */
export interface DrawSchedule {
  draws: PublicDraw[];
  exceptions: PublicDrawException[];
}

export const minutesToTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** "09:18" -> 558; null se não for um horário válido. */
export function timeToMinutes(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Dia da semana (0 = domingo) de uma data YYYY-MM-DD. */
export const weekdayOfDate = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** O sorteio corre na data: sem cancelamento (dele ou do dia todo) e no dia da semana dele ou com extra. */
export function drawRunsOn(
  draw: Pick<PublicDraw, 'id' | 'weekdays'>,
  date: string,
  exceptions: readonly PublicDrawException[],
): boolean {
  const today = exceptions.filter((e) => e.date === date);
  if (today.some((e) => e.kind === 'CANCEL' && (e.drawId === null || e.drawId === draw.id))) return false;
  return draw.weekdays.includes(weekdayOfDate(date)) || today.some((e) => e.kind === 'EXTRA' && e.drawId === draw.id);
}

/** Sorteios de um jogo que correm na data, na ordem do cadastro. */
export const drawsOn = (schedule: DrawSchedule, date: string, game: DrawGame) =>
  schedule.draws.filter((d) => d.games.includes(game) && drawRunsOn(d, date, schedule.exceptions));

/** Ainda aceita apostas: dentro da janela de dias e antes do horário máximo de venda (Brasília). */
export function isDrawOpenAt(nowIso: string, dayOffset: number, closesAt: string): boolean {
  if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset > DRAW_MAX_DAY_OFFSET) return false;
  const closes = timeToMinutes(closesAt);
  if (closes === null) return false;
  const now = brasiliaNow(nowIso);
  return now.hour * 60 + now.minute < dayOffset * 24 * 60 + closes;
}

/**
 * Mesma regra, pela data (YYYY-MM-DD) em vez do deslocamento: continua certa com a tela aberta depois da
 * meia-noite (a data escolhida vira "ontem" e fecha).
 */
export function isDrawOpenOn(nowIso: string, date: string, closesAt: string): boolean {
  const offset = dayOffsetOf(nowIso, date);
  return offset !== null && isDrawOpenAt(nowIso, offset, closesAt);
}

export interface DrawGroup<T extends Pick<PublicDraw, 'group'> = PublicDraw> {
  label: string;
  draws: T[];
}

/** Agrupa mantendo a ordem do cadastro (o grupo aparece onde aparece o primeiro sorteio dele). */
export function groupDraws<T extends Pick<PublicDraw, 'group'>>(draws: readonly T[]): DrawGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const draw of draws) {
    const list = groups.get(draw.group);
    if (list) list.push(draw);
    else groups.set(draw.group, [draw]);
  }
  return [...groups].map(([label, list]) => ({ label, draws: list }));
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export interface AdminDraw extends PublicDraw {
  /** Código curto dos relatórios (ex.: PT14). */
  code: string;
  active: boolean;
  sortOrder: number;
}

export interface AdminDrawException extends PublicDrawException {
  id: string;
  /** Nome do sorteio; null = todos os sorteios do dia. */
  drawName: string | null;
  note: string | null;
  /** ISO 8601. */
  createdAt: string;
}

/** GET /v1/admin/draws: todos os sorteios (ativos e inativos) e as exceções de hoje em diante. */
export interface AdminDrawsResponse {
  draws: AdminDraw[];
  exceptions: AdminDrawException[];
}

/** POST /v1/admin/draws e PUT /v1/admin/draws/:id. */
export interface SaveDrawRequest {
  group: string;
  name: string;
  /** Código curto (ex.: PT14); vazio = gerado do nome e da hora. */
  code: string;
  drawTime: string;
  closesAt: string;
  weekdays: number[];
  games: DrawGame[];
  active: boolean;
  sortOrder: number;
}

/** POST /v1/admin/draws/exceptions. */
export interface CreateDrawExceptionRequest {
  date: string;
  /** null = todos os sorteios do dia (só para CANCEL). */
  drawId: string | null;
  kind: DrawExceptionKind;
  note?: string;
}
