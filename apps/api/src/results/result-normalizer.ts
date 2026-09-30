import { RESULT_LOTTERY_CODE_PATTERN, RESULT_NUMBER_PATTERN, RESULT_PRIZES, dayOffsetOf } from '@sysjb/contracts';
import { z } from 'zod';

/**
 * Resultado no formato interno, igual para as duas origens (webhook e consulta). Tudo aqui já foi conferido:
 * data real e não futura, sigla, extração 0–23, 5 a 10 prêmios com 4–5 dígitos e campos calculados só com dígitos.
 */
export interface NormalizedResult {
  /** YYYY-MM-DD (Brasília). */
  date: string;
  lottery: string;
  extraction: number;
  prizes: string[];
  sum: string | null;
  multiplication: string | null;
  skipped: string | null;
  super5: string | null;
}

export type ResultIssue = { field: string; message: string };

export type NormalizeOutcome = { ok: true; result: NormalizedResult } | { ok: false; issues: ResultIssue[] };

/** Menor data aceita (a tabela recusa antes disso). */
const MIN_DATE = '2020-01-01';

/** Texto curto: o provedor manda strings; número só onde não há zero à esquerda a perder (extração). */
const text = z.string().trim().max(64);
const extraField = z.union([text, z.number().int().nonnegative()]).optional().nullable();

/** "0" ou vazio = não informado (é como o provedor preenche campos que a loteria não usa). */
function extra(value: string | number | null | undefined): string | null | 'invalid' {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (raw === '' || raw === '0') return null;
  return /^\d{1,12}$/.test(raw) ? raw : 'invalid';
}

/** Data do sorteio: aceita YYYY-MM-DD ou DD/MM/YYYY (a consulta devolve os dois formatos). */
function parseDate(raw: string): string | null {
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : raw;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/** Hora da extração: "09", "9" ou 9. */
function parseExtraction(raw: string | number): number | null {
  const value = typeof raw === 'number' ? raw : /^\d{1,2}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : null;
}

/**
 * Prêmios na ordem (1º em diante). "0" (ou vazio/ausente) marca prêmio não usado pela loteria e só vale no fim da
 * lista; um número real sempre tem 4 ou 5 dígitos, então "0000" é um resultado válido.
 */
function parsePrizes(
  values: ReadonlyArray<string | undefined>,
  field: (index: number) => string,
): {
  prizes: string[];
  issues: ResultIssue[];
} {
  const issues: ResultIssue[] = [];
  const prizes: string[] = [];
  let ended = false;
  values.forEach((raw, index) => {
    const value = raw?.trim() ?? '';
    if (value === '' || value === '0') {
      ended = true;
      return;
    }
    if (ended) {
      issues.push({ field: field(index), message: 'Prêmio informado depois de um prêmio vazio.' });
    } else if (!RESULT_NUMBER_PATTERN.test(value)) {
      issues.push({ field: field(index), message: 'Use 4 ou 5 dígitos.' });
    } else {
      prizes.push(value);
    }
  });
  if (issues.length === 0 && prizes.length < RESULT_PRIZES.min) {
    issues.push({ field: field(prizes.length), message: `Informe pelo menos ${RESULT_PRIZES.min} prêmios.` });
  }
  return { prizes, issues };
}

interface RawResult {
  date: { field: string; value: string };
  lottery: { field: string; value: string };
  extraction: { field: string; value: string | number };
  prizes: { values: ReadonlyArray<string | undefined>; field: (index: number) => string };
  extras: Record<
    'sum' | 'multiplication' | 'skipped' | 'super5',
    { field: string; value: string | number | null | undefined }
  >;
}

/** Regras comuns às duas origens. `nowIso` define "hoje" em Brasília (resultado de data futura é recusado). */
function normalize(raw: RawResult, nowIso: string): NormalizeOutcome {
  const issues: ResultIssue[] = [];

  const date = parseDate(raw.date.value);
  const offset = date === null ? null : dayOffsetOf(nowIso, date);
  if (date === null || offset === null) issues.push({ field: raw.date.field, message: 'Data inválida.' });
  else if (offset > 0) issues.push({ field: raw.date.field, message: 'Data no futuro.' });
  else if (date < MIN_DATE) issues.push({ field: raw.date.field, message: 'Data muito antiga.' });

  const lottery = raw.lottery.value.trim().toLowerCase();
  if (!RESULT_LOTTERY_CODE_PATTERN.test(lottery)) issues.push({ field: raw.lottery.field, message: 'Sigla inválida.' });

  const extraction = parseExtraction(raw.extraction.value);
  if (extraction === null) issues.push({ field: raw.extraction.field, message: 'Extração inválida (00 a 23).' });

  const prizes = parsePrizes(raw.prizes.values, raw.prizes.field);
  issues.push(...prizes.issues);

  const extras = {} as Record<keyof RawResult['extras'], string | null>;
  for (const [key, { field, value }] of Object.entries(raw.extras) as Array<
    [keyof RawResult['extras'], RawResult['extras'][keyof RawResult['extras']]]
  >) {
    const parsed = extra(value);
    if (parsed === 'invalid') issues.push({ field, message: 'Use só dígitos.' });
    else extras[key] = parsed;
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    result: { date: date!, lottery, extraction: extraction!, prizes: prizes.prizes, ...extras },
  };
}

// ---------------------------------------------------------------------------
// Webhook (POST do provedor)
// ---------------------------------------------------------------------------

export const PRIZE_FIELDS = [
  'primeiro_premio',
  'segundo_premio',
  'terceiro_premio',
  'quarto_premio',
  'quinto_premio',
  'sexto_premio',
  'setimo_premio',
  'oitavo_premio',
  'nono_premio',
  'decimo_premio',
] as const;

/**
 * Corpo do webhook. Campos desconhecidos são ignorados (o provedor pode acrescentar campos); res_api_chave e
 * res_servidor não são guardados. Prêmios só como texto: número perderia o zero à esquerda.
 */
const webhookSchema = z.object({
  res_data: text,
  res_loteria: text,
  res_extracao: z.union([text, z.number()]),
  res_resultado: z.string().max(200).optional(),
  ...(Object.fromEntries(PRIZE_FIELDS.map((field) => [field, text.optional()])) as Record<
    (typeof PRIZE_FIELDS)[number],
    z.ZodOptional<typeof text>
  >),
  res_soma: extraField,
  res_multiplicacao: extraField,
  res_salteado: extraField,
  res_super5: extraField,
});

export function normalizeWebhook(body: unknown, nowIso: string): NormalizeOutcome {
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    // Só nomes de campos: nunca os valores recebidos.
    const received = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => {
        const key = issue.path[0];
        const missing = typeof key === 'string' && received[key] === undefined;
        return { field: issue.path.join('.') || 'body', message: missing ? 'Campo obrigatório.' : 'Valor inválido.' };
      }),
    };
  }
  const p = parsed.data;
  const outcome = normalize(
    {
      date: { field: 'res_data', value: p.res_data },
      lottery: { field: 'res_loteria', value: p.res_loteria },
      extraction: { field: 'res_extracao', value: p.res_extracao },
      prizes: { values: PRIZE_FIELDS.map((field) => p[field]), field: (index) => PRIZE_FIELDS[index] ?? 'prizes' },
      extras: {
        sum: { field: 'res_soma', value: p.res_soma },
        multiplication: { field: 'res_multiplicacao', value: p.res_multiplicacao },
        skipped: { field: 'res_salteado', value: p.res_salteado },
        super5: { field: 'res_super5', value: p.res_super5 },
      },
    },
    nowIso,
  );

  // O resultado completo (res_resultado) tem que bater com os prêmios um a um: protege contra envio corrompido.
  if (outcome.ok && p.res_resultado?.trim()) {
    const listed = p.res_resultado.split(',').map((n) => n.trim());
    if (outcome.result.prizes.some((prize, index) => listed[index] !== prize)) {
      return { ok: false, issues: [{ field: 'res_resultado', message: 'Não confere com os prêmios.' }] };
    }
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// API de consulta (GET nossa ao provedor)
// ---------------------------------------------------------------------------

const consultaItemSchema = z.object({
  data: text,
  loteria: text,
  extracao: z.union([text, z.number()]),
  // { "1": "9423", "2": "1254", ... }
  resultado: z.record(z.string().regex(/^\d{1,2}$/), z.union([text, z.number()]).nullable()),
  Soma: extraField,
  Multiplicacao: extraField,
  Salteado: extraField,
  Super5: extraField,
});

/** Resposta de sucesso da consulta. Itens com formato inesperado são tratados um a um (ver normalizeConsulta). */
export const consultaResponseSchema = z.object({
  dados: z.object({ resultados: z.array(z.unknown()).max(500) }),
});

export function normalizeConsultaItem(item: unknown, nowIso: string): NormalizeOutcome {
  const parsed = consultaItemSchema.safeParse(item);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'item',
        message: 'Valor inválido.',
      })),
    };
  }
  const p = parsed.data;
  const positions = Object.keys(p.resultado)
    .map(Number)
    .sort((a, b) => a - b);
  // Posições precisam ser 1..N sem buracos (e no máximo 10).
  if (positions.some((position, index) => position !== index + 1) || positions.length > RESULT_PRIZES.max) {
    return { ok: false, issues: [{ field: 'resultado', message: 'Prêmios fora de ordem.' }] };
  }
  return normalize(
    {
      date: { field: 'data', value: p.data },
      lottery: { field: 'loteria', value: p.loteria },
      extraction: { field: 'extracao', value: p.extracao },
      prizes: {
        // Se vier como número JSON, um zero à esquerda perdido (325 em vez de 0325) cai na regra de 4–5 dígitos.
        values: positions.map((position) => {
          const value = p.resultado[String(position)];
          return value === null || value === undefined ? undefined : String(value);
        }),
        field: (index) => `resultado.${index + 1}`,
      },
      extras: {
        sum: { field: 'Soma', value: p.Soma },
        multiplication: { field: 'Multiplicacao', value: p.Multiplicacao },
        skipped: { field: 'Salteado', value: p.Salteado },
        super5: { field: 'Super5', value: p.Super5 },
      },
    },
    nowIso,
  );
}
