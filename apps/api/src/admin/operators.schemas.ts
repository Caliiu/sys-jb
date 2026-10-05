import { OPERATOR_ROLES } from '@sysjb/contracts';
import { z } from 'zod';

/** Cadastro e alteração de operador: nome, e-mail (login do painel, único no sistema) e perfil. */
export const saveOperatorSchema = z.strictObject({
  name: z
    .string({ error: 'Informe o nome.' })
    .trim()
    .min(2, 'Nome de 2 a 120 caracteres.')
    .max(120, 'Nome de 2 a 120 caracteres.'),
  email: z
    .string({ error: 'Informe o e-mail.' })
    .trim()
    .toLowerCase()
    .max(254, 'E-mail inválido.')
    .pipe(z.email('E-mail inválido.')),
  role: z.enum(OPERATOR_ROLES, { error: 'Perfil inválido.' }),
});
export type SaveOperatorInput = z.infer<typeof saveOperatorSchema>;

export const operatorStatusSchema = z.strictObject({ active: z.boolean({ error: 'Informe a situação.' }) });
export type OperatorStatusInput = z.infer<typeof operatorStatusSchema>;

export const operatorIdSchema = z.uuid({ error: 'Operador inválido.' });
