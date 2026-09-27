import { MAX_COMMISSION_BPS, MIN_COMMISSION_BPS, USER_STATUSES } from '@sysjb/contracts';
import { z } from 'zod';

/** Login do operador por e-mail + senha. Mensagens genéricas: a credencial é decidida no serviço. */
export const operatorLoginSchema = z.strictObject({
  email: z
    .string({ error: 'Informe o e-mail.' })
    .trim()
    .toLowerCase()
    .min(1, 'Informe o e-mail.')
    .max(254, 'E-mail inválido.'),
  password: z.string({ error: 'Informe a senha.' }).min(1, 'Informe a senha.').max(128, 'Senha inválida.'),
});

export const operatorTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Query da lista: página (padrão 1), tamanho (padrão 20, máx. 100), busca e status. Chaves desconhecidas são rejeitadas. */
export const listUsersQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z
    .string()
    .trim()
    .max(100, 'Busca muito longa.')
    .optional()
    .transform((value) => value || undefined),
  status: z.enum(USER_STATUSES).optional(),
});

/** Lista de promotores (e de jogadores de um promotor): paginação e, na lista de promotores, busca. */
export const listPromotersQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z
    .string()
    .trim()
    .max(100, 'Busca muito longa.')
    .optional()
    .transform((value) => value || undefined),
});

export const referralsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Comissão em centésimos de %: inteiro de 1 a 10000 (nunca ponto flutuante). */
export const setPromoterSchema = z.strictObject({
  commissionBps: z
    .number({ error: 'Informe a comissão.' })
    .int('A comissão deve ser um inteiro (centésimos de %).')
    .min(MIN_COMMISSION_BPS, 'A comissão mínima é 0,01%.')
    .max(MAX_COMMISSION_BPS, 'A comissão máxima é 100%.'),
});

export const setUserStatusSchema = z.strictObject({ status: z.enum(USER_STATUSES) });

export type OperatorLoginInput = z.output<typeof operatorLoginSchema>;
export type ListUsersQuery = z.output<typeof listUsersQuerySchema>;
export type ListPromotersQuery = z.output<typeof listPromotersQuerySchema>;
export type ReferralsQuery = z.output<typeof referralsQuerySchema>;
export type SetPromoterInput = z.output<typeof setPromoterSchema>;
export type SetUserStatusInput = z.output<typeof setUserStatusSchema>;
