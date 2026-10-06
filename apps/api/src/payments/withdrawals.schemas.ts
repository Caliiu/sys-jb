import {
  OPERATION_SUMMARY_MAX_DAYS,
  WITHDRAWAL_KEY_TYPES,
  WITHDRAWAL_LIMITS,
  WITHDRAWAL_STATUSES,
  digitsOnly,
  isValidBrPhone,
} from '@sysjb/contracts';
import { z } from 'zod';
import { checkPeriod } from '../admin/admin.schemas.js';

const EMAIL = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/;
const RANDOM_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Solicitação de saque do jogador. A chave é normalizada aqui (CPF e celular só dígitos; e-mail e aleatória em
 * minúsculas) e conferida no formato do tipo; o banco confere de novo (e que a chave CPF é a do titular).
 */
export const createWithdrawalSchema = z
  .strictObject({
    amountCents: z
      .number({ error: 'Informe o valor.' })
      .int('Valor em centavos inteiros.')
      .min(WITHDRAWAL_LIMITS.minCents, 'Valor abaixo do mínimo.')
      .max(WITHDRAWAL_LIMITS.maxCents, 'Valor acima do máximo.'),
    keyType: z.enum(WITHDRAWAL_KEY_TYPES, { error: 'Escolha o tipo de chave.' }),
    keyValue: z.string({ error: 'Informe a chave Pix.' }).max(200, 'Chave Pix inválida.'),
    idempotencyKey: z.uuid({ error: 'Pedido inválido. Atualize a página e tente de novo.' }),
  })
  .transform((input) => ({
    ...input,
    keyValue:
      input.keyType === 'CPF' || input.keyType === 'PHONE'
        ? digitsOnly(input.keyValue)
        : input.keyValue.trim().toLowerCase(),
  }))
  .superRefine((input, ctx) => {
    const value = input.keyValue;
    const valid =
      input.keyType === 'CPF'
        ? /^[0-9]{11}$/.test(value)
        : input.keyType === 'PHONE'
          ? value.length === 11 && isValidBrPhone(value)
          : input.keyType === 'EMAIL'
            ? value.length <= 77 && EMAIL.test(value)
            : RANDOM_KEY.test(value);
    if (!valid)
      ctx.addIssue({ code: 'custom', path: ['keyValue'], message: 'Chave Pix inválida para o tipo escolhido.' });
  });
export type CreateWithdrawalInput = z.output<typeof createWithdrawalSchema>;

export const withdrawalIdSchema = z.uuid({ error: 'Saque inválido.' });

/** Decisão do Gerente sobre um saque em análise. */
export const reviewWithdrawalSchema = z.strictObject({
  approve: z.boolean({ error: 'Informe se aprova ou recusa.' }),
  note: z
    .string()
    .trim()
    .min(WITHDRAWAL_LIMITS.noteMin, `Motivo com ao menos ${WITHDRAWAL_LIMITS.noteMin} caracteres.`)
    .max(WITHDRAWAL_LIMITS.noteMax, `Motivo com até ${WITHDRAWAL_LIMITS.noteMax} caracteres.`)
    .regex(/^[^\p{Cc}]*$/u, 'Motivo inválido.')
    .optional(),
});
export type ReviewWithdrawalInput = z.infer<typeof reviewWithdrawalSchema>;

/** Conclusão manual de um envio sem resposta. */
export const resolveWithdrawalSchema = z.strictObject({
  paid: z.boolean({ error: 'Informe se o saque foi pago.' }),
});

/** Limites de saque da banca. O banco confere de novo (mínimo ≤ máximo, automático ≤ máximo). */
export const withdrawalSettingsSchema = z
  .strictObject({
    enabled: z.boolean({ error: 'Informe se os saques ficam ligados.' }),
    minCents: z.number().int().min(WITHDRAWAL_LIMITS.minCents).max(WITHDRAWAL_LIMITS.maxCents),
    maxCents: z.number().int().min(WITHDRAWAL_LIMITS.minCents).max(WITHDRAWAL_LIMITS.maxCents),
    dailyCount: z.number().int().min(1).max(WITHDRAWAL_LIMITS.maxDailyCount),
    autoLimitCents: z.number().int().min(0).max(WITHDRAWAL_LIMITS.maxCents),
  })
  .superRefine((input, ctx) => {
    if (input.minCents > input.maxCents) {
      ctx.addIssue({ code: 'custom', path: ['minCents'], message: 'O mínimo não pode passar do máximo.' });
    }
    if (input.autoLimitCents > input.maxCents) {
      ctx.addIssue({
        code: 'custom',
        path: ['autoLimitCents'],
        message: 'O limite automático não pode passar do máximo.',
      });
    }
  });
export type WithdrawalSettingsInput = z.infer<typeof withdrawalSettingsSchema>;

/** Carteira > Saques: período (dias de Brasília), apostador, promotor, situação e paginação. */
export const listWithdrawalsQuerySchema = z
  .strictObject({
    from: z.string({ error: 'Informe o início do período.' }),
    to: z.string({ error: 'Informe o fim do período.' }),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    userId: z.uuid({ error: 'userId deve ser um UUID.' }).optional(),
    promoterId: z.uuid({ error: 'promoterId deve ser um UUID.' }).optional(),
    status: z.enum(WITHDRAWAL_STATUSES, { error: 'Situação inválida.' }).optional(),
  })
  .superRefine((query, ctx) => checkPeriod(query, ctx, OPERATION_SUMMARY_MAX_DAYS));
export type ListWithdrawalsQuery = z.output<typeof listWithdrawalsQuerySchema>;
