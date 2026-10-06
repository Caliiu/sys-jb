import {
  DEPOSIT_DESTINATIONS,
  DEPOSIT_LIMITS,
  DEPOSIT_STATUSES,
  OPERATION_SUMMARY_MAX_DAYS,
  PAYMENT_CREDENTIAL_PATTERN,
  PAYMENT_GATEWAYS,
} from '@sysjb/contracts';
import { z } from 'zod';
import { checkPeriod } from '../admin/admin.schemas.js';

export const paymentGatewayParamSchema = z.enum(PAYMENT_GATEWAYS, { error: 'Gateway desconhecido.' });

const credential = (label: string) =>
  z
    .string({ error: `Informe o ${label}.` })
    .trim()
    .regex(PAYMENT_CREDENTIAL_PATTERN, `${label} inválido (8 a 256 caracteres, sem espaços).`);

/** Credenciais do gateway (substituem as gravadas); `activate` já o deixa como o gateway da banca. */
export const savePaymentGatewaySchema = z.strictObject({
  clientId: credential('Client ID'),
  clientSecret: credential('Client Secret'),
  activate: z.boolean({ error: 'Informe se o gateway fica ativo.' }),
});
export type SavePaymentGatewayInput = z.infer<typeof savePaymentGatewaySchema>;

export const setPaymentGatewayActiveSchema = z.strictObject({
  active: z.boolean({ error: 'Informe a situação.' }),
});

/** Recarga Pix do jogador: valor em centavos (inteiro, nos limites) e onde usar o crédito. */
export const createDepositSchema = z.strictObject({
  amountCents: z
    .number({ error: 'Informe o valor.' })
    .int('Valor em centavos inteiros.')
    .min(DEPOSIT_LIMITS.minCents, 'Valor abaixo do mínimo.')
    .max(DEPOSIT_LIMITS.maxCents, 'Valor acima do máximo.'),
  destination: z.enum(DEPOSIT_DESTINATIONS, { error: 'Escolha onde usar o crédito.' }),
});
export type CreateDepositInput = z.infer<typeof createDepositSchema>;

export const depositIdSchema = z.uuid({ error: 'Depósito inválido.' });

/** Decisão do Gerente sobre um depósito em análise. */
export const reviewDepositSchema = z.strictObject({
  approve: z.boolean({ error: 'Informe se libera ou recusa.' }),
});

/** Carteira > Depósitos: período (dias de Brasília), apostador, promotor, situação e paginação. */
export const listDepositsQuerySchema = z
  .strictObject({
    from: z.string({ error: 'Informe o início do período.' }),
    to: z.string({ error: 'Informe o fim do período.' }),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    userId: z.uuid({ error: 'userId deve ser um UUID.' }).optional(),
    promoterId: z.uuid({ error: 'promoterId deve ser um UUID.' }).optional(),
    status: z.enum(DEPOSIT_STATUSES, { error: 'Situação inválida.' }).optional(),
  })
  .superRefine((query, ctx) => checkPeriod(query, ctx, OPERATION_SUMMARY_MAX_DAYS));
export type ListDepositsQuery = z.output<typeof listDepositsQuerySchema>;

/** Endereço do aviso (webhook): o id do depósito e a assinatura dele (HMAC), como vieram na URL. */
export const depositWebhookQuerySchema = z.object({
  d: z.uuid(),
  t: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
