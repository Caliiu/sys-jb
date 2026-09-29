/** Formatação de datas para a interface (pt-BR, fuso de Brasília). */

// Fuso fixo (Brasília): servidor e navegador formatam igual, sem divergência de hidratação.
const DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' });
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

/** ISO 8601 -> "25/09/2026" */
export const formatDate = (iso: string): string => DATE.format(new Date(iso));

const TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});
const SHORT_DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});

/** ISO 8601 -> "25/09/26" */
export const formatShortDate = (iso: string): string => SHORT_DATE.format(new Date(iso));

/** ISO 8601 -> "11:10" */
export const formatTime = (iso: string): string => TIME.format(new Date(iso));

/** ISO 8601 -> "26/09/26 11:10" */
export const formatShortDateTime = (iso: string): string => SHORT_DATE_TIME.format(new Date(iso)).replace(', ', ' ');

const DATE_TIME_SECONDS = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const CLOCK = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** ISO 8601 -> "16:02:43" (relógio do painel) */
export const formatClock = (iso: string): string => CLOCK.format(new Date(iso));

/** ISO 8601 -> "28/09/2026 20:18:40" (cabeçalho dos comprovantes) */
export const formatDateTimeSeconds = (iso: string): string =>
  DATE_TIME_SECONDS.format(new Date(iso)).replace(', ', ' ');

/** ISO 8601 -> "25/09/2026 14:30" */
export const formatDateTime = (iso: string): string => DATE_TIME.format(new Date(iso)).replace(', ', ' ');

/** "1990-05-17" (data de calendário, sem fuso) -> "17/05/1990" */
export function formatCalendarDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export const formatBirthDate = formatCalendarDate;

/** "2026-09-28" (data de calendário, sem fuso) -> "28/09/26" */
export function formatShortCalendarDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year!.slice(-2)}`;
}
