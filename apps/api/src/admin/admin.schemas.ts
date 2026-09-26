import { USER_STATUSES } from '@sysjb/contracts';
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

export const setUserStatusSchema = z.strictObject({ status: z.enum(USER_STATUSES) });

export type OperatorLoginInput = z.output<typeof operatorLoginSchema>;
export type ListUsersQuery = z.output<typeof listUsersQuerySchema>;
export type SetUserStatusInput = z.output<typeof setUserStatusSchema>;
