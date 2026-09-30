import { DRAW_EXCEPTION_KINDS, DRAW_GAMES, DRAW_LIMITS, isResultSource } from '@sysjb/contracts';
import { z } from 'zod';

const time = (label: string) => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label}: use HH:MM.`);

/** Cadastro/alteração de sorteio. Horário limite <= horário do sorteio é conferido no serviço (e no banco). */
export const saveDrawSchema = z.strictObject({
  group: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Informe o grupo.')
    .max(DRAW_LIMITS.groupMax, `No máximo ${DRAW_LIMITS.groupMax} caracteres.`),
  name: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Informe o nome.')
    .max(DRAW_LIMITS.nameMax, `No máximo ${DRAW_LIMITS.nameMax} caracteres.`),
  // Vazio = gerado do nome e da hora.
  code: z
    .string()
    .trim()
    .toUpperCase()
    .max(DRAW_LIMITS.codeMax, `No máximo ${DRAW_LIMITS.codeMax} caracteres.`)
    .regex(/^[A-Z0-9]*$/, 'Use só letras e números, sem espaços.'),
  drawTime: time('Horário do sorteio'),
  closesAt: time('Venda até'),
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Escolha pelo menos um dia.')
    .max(7)
    .refine((days) => new Set(days).size === days.length, 'Dias repetidos.'),
  games: z
    .array(z.enum(DRAW_GAMES))
    .min(1, 'Escolha pelo menos um jogo.')
    .max(DRAW_GAMES.length)
    .refine((games) => new Set(games).size === games.length, 'Jogos repetidos.'),
  // Loteria + extração do provedor (catálogo); null = sem ligação com resultado.
  result: z
    .strictObject({ lottery: z.string(), extraction: z.number().int() })
    .refine(isResultSource, 'Escolha um resultado da lista.')
    .nullable(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(DRAW_LIMITS.sortOrderMax),
});
export type SaveDrawInput = z.infer<typeof saveDrawSchema>;

export const createDrawExceptionSchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  drawId: z.uuid('Sorteio inválido.').nullable(),
  kind: z.enum(DRAW_EXCEPTION_KINDS),
  note: z
    .string()
    .trim()
    .max(DRAW_LIMITS.noteMax, `No máximo ${DRAW_LIMITS.noteMax} caracteres.`)
    .optional()
    .transform((value) => value || undefined),
});
export type CreateDrawExceptionInput = z.infer<typeof createDrawExceptionSchema>;

export const drawIdSchema = z.uuid('Id inválido.');
