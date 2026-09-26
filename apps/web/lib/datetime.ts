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

/** ISO 8601 -> "11:10" */
export const formatTime = (iso: string): string => TIME.format(new Date(iso));

/** ISO 8601 -> "26/09/26 11:10" */
export const formatShortDateTime = (iso: string): string => SHORT_DATE_TIME.format(new Date(iso)).replace(', ', ' ');

/** ISO 8601 -> "25/09/2026 14:30" */
export const formatDateTime = (iso: string): string => DATE_TIME.format(new Date(iso)).replace(', ', ' ');

/** "1990-05-17" (data de calendário, sem fuso) -> "17/05/1990" */
export function formatBirthDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}
