import { PULE_CODE_PATTERN } from '@sysjb/contracts';
import { z } from 'zod';

export const prizesQuerySchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
});
export type PrizesQuery = z.infer<typeof prizesQuerySchema>;

export const claimQuerySchema = z.strictObject({
  pule: z.string().regex(PULE_CODE_PATTERN, 'Código da pule inválido.').transform(Number),
});
export type ClaimQuery = z.infer<typeof claimQuerySchema>;
