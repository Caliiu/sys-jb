import { CASINO_LIMITS } from '@sysjb/contracts';
import { z } from 'zod';

/** Lista do cassino: provedor ("Ver todos"), busca e página. */
export const casinoGamesQuerySchema = z.strictObject({
  provider: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9 ._()&-]{0,59}$/, 'Provedor inválido.')
    .optional(),
  search: z
    .string()
    .trim()
    .min(CASINO_LIMITS.searchMin, `Busque com ao menos ${CASINO_LIMITS.searchMin} letras.`)
    .max(CASINO_LIMITS.searchMax, 'Busca muito longa.')
    .optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type CasinoGamesQuery = z.infer<typeof casinoGamesQuerySchema>;

export const casinoGameIdSchema = z.coerce.number().int().min(1).max(2_147_483_647);
