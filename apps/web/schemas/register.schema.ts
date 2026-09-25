import {
  birthDateProblem,
  digitsOnly,
  isValidBrPhone,
  isValidCpf,
  PASSWORD_MAX,
  passwordProblem,
} from '@sysjb/contracts';
import { z } from 'zod';

/**
 * Validação no navegador para feedback imediato. Usa as mesmas regras da API
 * (@sysjb/contracts), que continua sendo a validação oficial.
 * A ordem dos campos segue a ordem do formulário: o primeiro erro exibido é o do primeiro campo.
 */
export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe seu nome completo.').max(120, 'O nome deve ter no máximo 120 caracteres.'),
    phone: z.string().transform(digitsOnly).refine(isValidBrPhone, 'Informe um telefone válido com DDD.'),
    cpf: z
      .string()
      .transform(digitsOnly)
      .refine((v) => v.length === 11, 'Informe os 11 dígitos do CPF.')
      .refine(isValidCpf, 'CPF inválido.'),
    birthDate: z.string().superRefine((value, ctx) => {
      if (!value) {
        ctx.addIssue({ code: 'custom', message: 'Informe a data de nascimento completa (DD/MM/AAAA).' });
        return;
      }
      const problem = birthDateProblem(value);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    }),
    password: z.string().max(PASSWORD_MAX),
  })
  .superRefine((data, ctx) => {
    const problem = passwordProblem(data.password, {
      document: data.cpf,
      phone: data.phone,
      birthDate: data.birthDate,
    });
    if (problem) ctx.addIssue({ code: 'custom', path: ['password'], message: problem });
  });

export type RegisterForm = z.output<typeof registerSchema>;
