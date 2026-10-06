import { CRM_INACTIVE_SORTS, CRM_LIMITS, CRM_NEVER_DEPOSITED_SORTS } from '@sysjb/contracts';
import { z } from 'zod';

const days = (label: string) =>
  z.coerce
    .number({ error: `Informe ${label}.` })
    .int(`${label} em dias inteiros.`)
    .min(0, `${label} não pode ser negativo.`)
    .max(CRM_LIMITS.maxDays, `${label}: até ${CRM_LIMITS.maxDays} dias.`);

/** Campos comuns: faixa de dias (mínimo ≤ máximo), promotor e paginação. */
const base = {
  minDays: days('O mínimo de dias'),
  maxDays: days('O máximo de dias'),
  promoterId: z.uuid({ error: 'promoterId deve ser um UUID.' }).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  dir: z.enum(['asc', 'desc'], { error: 'Direção inválida.' }).default('desc'),
};

const checkRange = (query: { minDays: number; maxDays: number }, ctx: z.RefinementCtx) => {
  if (query.minDays > query.maxDays) {
    ctx.addIssue({ code: 'custom', path: ['maxDays'], message: 'O máximo de dias não pode ser menor que o mínimo.' });
  }
};

/** Apostadores inativos: dias sem depositar. Padrão: os há mais tempo sem depositar primeiro. */
export const crmInactiveQuerySchema = z
  .strictObject({
    ...base,
    sort: z.enum(CRM_INACTIVE_SORTS, { error: 'Ordenação inválida.' }).default('daysWithoutDeposit'),
  })
  .superRefine(checkRange);
export type CrmInactiveQuery = z.output<typeof crmInactiveQuerySchema>;

/** Nunca depositantes: dias desde o cadastro. Padrão: os cadastros mais antigos primeiro. */
export const crmNeverDepositedQuerySchema = z
  .strictObject({
    ...base,
    sort: z.enum(CRM_NEVER_DEPOSITED_SORTS, { error: 'Ordenação inválida.' }).default('relationshipDays'),
  })
  .superRefine(checkRange);
export type CrmNeverDepositedQuery = z.output<typeof crmNeverDepositedQuerySchema>;
