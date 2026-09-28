import { FAZENDINHA_MAX_NUMBERS_PER_BET, FAZENDINHA_MODE_IDS } from '@sysjb/contracts';
import { z } from 'zod';

const drawDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');

/**
 * Compra de palpites: só o formato aqui. Catálogo (extração, valor, faixa dos números) e horário são
 * conferidos no serviço, com as mesmas regras da tela (@sysjb/contracts).
 */
export const placeBetSchema = z.strictObject({
  idempotencyKey: z.uuid('Chave inválida.'),
  drawDate,
  lottery: z.string().min(1).max(40),
  hour: z.number().int().min(0).max(23),
  mode: z.enum(FAZENDINHA_MODE_IDS),
  stakeCents: z.number().int().positive(),
  prizeCents: z.number().int().positive(),
  numbers: z
    .array(z.number().int().min(0).max(999))
    .min(1, 'Escolha pelo menos um palpite.')
    .max(FAZENDINHA_MAX_NUMBERS_PER_BET, `No máximo ${FAZENDINHA_MAX_NUMBERS_PER_BET} palpites por compra.`)
    .refine((numbers) => new Set(numbers).size === numbers.length, 'Palpites repetidos.'),
});
export type PlaceBetInput = z.infer<typeof placeBetSchema>;

export const soldQuerySchema = z.strictObject({ drawDate });
export type SoldQuery = z.infer<typeof soldQuerySchema>;
