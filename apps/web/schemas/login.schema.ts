import { digitsOnly } from '@sysjb/contracts';
import { z } from 'zod';

/** Só formato: se o CPF ou a senha estão errados, quem responde é a API (mensagem genérica). */
export const loginSchema = z.object({
  cpf: z
    .string()
    .transform(digitsOnly)
    .refine((v) => v.length > 0, 'Informe seu CPF.')
    .refine((v) => v.length === 11, 'Informe os 11 dígitos do CPF.'),
  password: z.string().min(1, 'Informe sua senha.').max(128, 'Senha inválida.'),
});

export type LoginForm = z.output<typeof loginSchema>;
