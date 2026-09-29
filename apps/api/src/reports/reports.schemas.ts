import { PULE_CODE_PATTERN } from '@sysjb/contracts';
import { z } from 'zod';

/** Data do relatório; a janela (hoje até N dias atrás) é conferida no serviço. */
export const reportDateQuerySchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
});
export type ReportDateQuery = z.infer<typeof reportDateQuerySchema>;

export const puleNumberSchema = z.string().regex(PULE_CODE_PATTERN, 'Código da pule inválido.').transform(Number);
