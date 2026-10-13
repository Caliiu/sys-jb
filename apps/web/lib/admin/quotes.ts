import {
  type AdminQuoteTable,
  FAZENDINHA_MODE_CODES,
  FAZENDINHA_MODES,
  type FazendinhaModeId,
  MAX_QUOTE_PRIZE_CENTS,
  QUOTE_TABLE_NAME_MAX,
  type SetFazendinhaQuotesRequest,
  type SetTraditionalQuotesRequest,
  type TraditionalQuoteModality,
} from '@sysjb/contracts';
import { formatBrl } from '../currency';
import { ADMIN_ROUTES } from './admin-routes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Tabela aberta pela URL (?tabela=<id>); null se ausente ou inválida. */
export function parseQuoteTableKey(raw: string | string[] | undefined): string | null {
  const value = first(raw) ?? '';
  return UUID.test(value) ? value.toLowerCase() : null;
}

/** Endereço da tela de cotações, com a tabela aberta (sem ela, a tela abre a padrão da banca). */
export const quotesHref = (tableId?: string | null): string =>
  tableId ? `${ADMIN_ROUTES.quotes}?tabela=${encodeURIComponent(tableId)}` : ADMIN_ROUTES.quotes;

/** Sigla de cada modalidade do Tradicional na tabela (coluna Código). */
export const TRADITIONAL_QUOTE_CODES: Record<TraditionalQuoteModality, string> = {
  unidade: 'U',
  grupo: 'G',
  dezena: 'D',
  centena: 'C',
  milhar: 'M',
  duque_gp: 'DG',
  terno_gp: 'TG',
  quadra_gp: 'QG',
  quina_gp_8_5: 'QNG',
  sena_gp_10_6: 'SNG',
  duque_dez: 'DD',
  terno_dez_seco: 'TDS',
  terno_dez: 'TD',
  palpitao: 'PLP',
  passe_vai: 'PV',
  passe_vai_vem: 'PVV',
};

export type QuoteGameId = 'tradicional' | 'fazendinha';

/** Uma linha da tabela de pagamento (modalidade do Tradicional ou modalidade × valor da Fazendinha). */
export type QuoteRow = {
  /** Chave estável da linha: "tradicional:centena" ou "fazendinha:grupo:100". */
  key: string;
  code: string;
  description: string;
  prizeCents: number;
} & (
  | { game: 'tradicional'; modality: TraditionalQuoteModality }
  | { game: 'fazendinha'; mode: FazendinhaModeId; stakeCents: number }
);

export const traditionalKey = (modality: string) => `tradicional:${modality}`;
export const fazendinhaKey = (mode: string, stakeCents: number) => `fazendinha:${mode}:${stakeCents}`;

const MODE_LABELS = new Map(FAZENDINHA_MODES.map((mode) => [mode.id, mode.label]));

/** As linhas da tabela, na ordem da tela: o Tradicional (ordem da API) e a Fazendinha por modalidade e valor. */
export function quoteRows(table: Pick<AdminQuoteTable, 'traditional' | 'fazendinha'>): QuoteRow[] {
  const traditional: QuoteRow[] = table.traditional.map((q) => ({
    key: traditionalKey(q.modality),
    game: 'tradicional',
    modality: q.modality,
    code: TRADITIONAL_QUOTE_CODES[q.modality] ?? q.modality.toUpperCase(),
    description: q.label,
    prizeCents: q.prizeCents,
  }));
  const modeOrder = new Map(FAZENDINHA_MODES.map((mode, index) => [mode.id, index]));
  const fazendinha: QuoteRow[] = [...table.fazendinha]
    .sort((a, b) => (modeOrder.get(a.mode) ?? 0) - (modeOrder.get(b.mode) ?? 0) || a.stakeCents - b.stakeCents)
    .map((q) => ({
      key: fazendinhaKey(q.mode, q.stakeCents),
      game: 'fazendinha',
      mode: q.mode,
      stakeCents: q.stakeCents,
      code: `${FAZENDINHA_MODE_CODES[q.mode]}-${q.stakeCents / 100}`,
      description: `FAZENDINHA ${MODE_LABELS.get(q.mode) ?? q.mode.toUpperCase()} ${formatBrl(q.stakeCents)}`,
      prizeCents: q.prizeCents,
    }));
  return [...traditional, ...fazendinha];
}

/** Texto comparável: sem acentos, sem diferenciar maiúsculas, espaços das pontas removidos. */
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** Filtro da tela por código ou descrição (ex.: "c", "centena", "gp-1"); vazio = todas. */
export function filterQuoteRows(rows: readonly QuoteRow[], term: string): readonly QuoteRow[] {
  const needle = normalize(term);
  if (!needle) return rows;
  return rows.filter((row) => normalize(row.code).includes(needle) || normalize(row.description).includes(needle));
}

/** Itens alterados, no formato dos dois endpoints (cada jogo grava separado na API). */
export interface QuoteValuesChanges {
  traditional: SetTraditionalQuotesRequest['quotes'];
  fazendinha: SetFazendinhaQuotesRequest['quotes'];
}

export type QuoteValuesDiff =
  { ok: true; changes: QuoteValuesChanges; count: number } | { ok: false; fieldErrors: Record<string, string> };

export const QUOTE_PRIZE_HELP = `De R$ 0,00 (desligada) a ${formatBrl(MAX_QUOTE_PRIZE_CENTS)}.`;

/**
 * Só o que mudou em relação à tabela salva (a API grava os itens enviados: dois gerentes editando ao mesmo tempo não
 * desfazem a alteração um do outro). `draft` = chave da linha -> centavos digitados.
 */
export function quoteValuesDiff(rows: readonly QuoteRow[], draft: Readonly<Record<string, number>>): QuoteValuesDiff {
  const fieldErrors: Record<string, string> = {};
  const changes: QuoteValuesChanges = { traditional: [], fazendinha: [] };
  for (const row of rows) {
    const prizeCents = draft[row.key];
    if (prizeCents === undefined || prizeCents === row.prizeCents) continue;
    if (!Number.isInteger(prizeCents) || prizeCents < 0 || prizeCents > MAX_QUOTE_PRIZE_CENTS) {
      fieldErrors[row.key] = QUOTE_PRIZE_HELP;
      continue;
    }
    if (row.game === 'tradicional') changes.traditional.push({ modality: row.modality, prizeCents });
    else changes.fazendinha.push({ mode: row.mode, stakeCents: row.stakeCents, prizeCents });
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, changes, count: changes.traditional.length + changes.fazendinha.length };
}

/**
 * Erros de campo da API ("quotes.3.prizeCents") apontam a posição do item no corpo enviado: troca pela chave da
 * linha da tela. O que não é de um item (ex.: "quotes") fica como veio.
 */
export function remapQuoteFieldErrors(
  fieldErrors: Readonly<Record<string, string>>,
  sentKeys: readonly string[],
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [field, message] of Object.entries(fieldErrors)) {
    const index = /^quotes\.(\d+)(?:\.|$)/.exec(field)?.[1];
    const key = index === undefined ? undefined : sentKeys[Number(index)];
    mapped[key ?? field] ??= message;
  }
  return mapped;
}

/** Nome da tabela como a API aceita: sem espaços nas pontas, 1 a 40 caracteres. Devolve o erro, ou null. */
export function quoteTableNameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Informe o nome da tabela.';
  if (trimmed.length > QUOTE_TABLE_NAME_MAX) return `O nome tem no máximo ${QUOTE_TABLE_NAME_MAX} caracteres.`;
  return null;
}
