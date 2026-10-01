import { BICHO_GROUPS } from '@sysjb/contracts';
import { z } from 'zod';
import type { OverdueRequest } from './overdue-client.js';

/** Atrasados validados: último dia de saída de cada grupo (índice 0 = grupo 1; null = nunca saiu no histórico). */
export interface NormalizedOverdue {
  /** Data de referência do provedor (YYYY-MM-DD). */
  referenceDate: string;
  lastDates: Array<string | null>;
}

/** YYYY-MM-DD que existe no calendário (2026-02-30 e 2026-13-01 não). */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
}

const calendarDate = z.string().refine(isCalendarDate);

/** O provedor manda o grupo ora como número (13), ora como texto ("02"). */
const groupField = z
  .union([
    z.number().int(),
    z
      .string()
      .regex(/^\d{1,2}$/)
      .transform(Number),
  ])
  .pipe(z.number().int().min(1).max(BICHO_GROUPS));

/** Extração e posição também vêm como texto ou número. */
const intField = z.union([
  z.number().int(),
  z
    .string()
    .regex(/^\d{1,2}$/)
    .transform(Number),
]);

const itemSchema = z.object({
  grupo: groupField,
  // Vazio ou ausente só vale para "nunca saiu".
  saida_original: z.union([calendarDate, z.literal('')]).nullish(),
  nunca_saiu: z.boolean().optional(),
});

const responseSchema = z.object({
  informacoes: z.object({
    sigla: z.string(),
    extracao: intField,
    tipo_busca: z.enum(['g', 'grupo', 'grupos']),
    posicao: intField,
    data_referencia: calendarDate,
  }),
  dados: z.object({ atrasados: z.array(itemSchema).length(BICHO_GROUPS) }),
});

/**
 * Valida a resposta do provedor contra o que foi pedido (mesma loteria, extração e posição 1) e exige os 25 grupos
 * sem repetição, cada um com a data da última saída (não depois da data de referência) ou marcado como "nunca saiu".
 * null = resposta inválida; quem chama não usa nada dela. Os dias do provedor não são usados: a contagem é feita aqui,
 * pela data, para o cache continuar certo depois da meia-noite.
 */
export function normalizeOverdue(body: unknown, request: OverdueRequest): NormalizedOverdue | null {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return null;
  const { informacoes, dados } = parsed.data;
  if (
    informacoes.sigla.toLowerCase() !== request.lottery ||
    informacoes.extracao !== request.extraction ||
    informacoes.posicao !== 1
  ) {
    return null;
  }

  const lastDates: Array<string | null | undefined> = Array.from({ length: BICHO_GROUPS }, () => undefined);
  for (const item of dados.atrasados) {
    const index = item.grupo - 1;
    if (lastDates[index] !== undefined) return null;
    if (item.nunca_saiu) {
      lastDates[index] = null;
      continue;
    }
    if (!item.saida_original || item.saida_original > informacoes.data_referencia) return null;
    lastDates[index] = item.saida_original;
  }
  // 25 itens sem repetição = todos os grupos preenchidos.
  return { referenceDate: informacoes.data_referencia, lastDates: lastDates.map((d) => d ?? null) };
}
