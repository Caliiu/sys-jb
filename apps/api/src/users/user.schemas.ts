import { z } from 'zod';
import {
  birthDateProblem,
  digitsOnly,
  isValidBrPhone,
  isValidCpf,
  PASSWORD_MAX,
  PASSWORD_MIN,
  passwordProblem,
} from '@sysjb/contracts';

const name = z
  .string({ error: 'Deve ser texto.' })
  .trim()
  .min(2, 'Deve ter entre 2 e 120 caracteres.')
  .max(120, 'Deve ter entre 2 e 120 caracteres.');

const email = z
  .string({ error: 'Deve ser texto ou null.' })
  .trim()
  .toLowerCase()
  .max(254, 'Email muito longo.')
  .pipe(z.email({ error: 'Email inválido.' }));

// Formato nacional: DDD (dois dígitos 1-9) + 8 dígitos (fixo) ou 9 iniciando por 9 (celular).
// Aceita separadores comuns na entrada; persiste somente dígitos.
const phone = z
  .string({ error: 'Deve ser texto.' })
  .max(32, 'Telefone inválido.')
  .regex(/^[\d\s().-]+$/, 'Telefone deve conter apenas dígitos e separadores.')
  .transform(digitsOnly)
  .pipe(z.string().refine(isValidBrPhone, 'Telefone deve ter DDD + número (10 ou 11 dígitos).'));

// CPF: 11 dígitos com dígitos verificadores válidos. Não é verificação de identidade nem de situação fiscal.
const document = z
  .string({ error: 'Deve ser texto.' })
  .max(32, 'CPF inválido.')
  .regex(/^[\d\s./-]+$/, 'CPF deve conter apenas dígitos e separadores.')
  .transform(digitsOnly)
  .pipe(
    z
      .string()
      .regex(/^\d{11}$/, 'CPF deve ter 11 dígitos.')
      .refine(isValidCpf, 'CPF inválido.'),
  );

// YYYY-MM-DD; exige maioridade na data de hoje em Brasília (regra compartilhada com o web).
const birthDate = z.string({ error: 'Deve ser texto no formato YYYY-MM-DD.' }).superRefine((value, ctx) => {
  const problem = birthDateProblem(value);
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
});

// Comprimento e senhas óbvias; a checagem de dados pessoais fica no objeto (precisa dos outros campos).
const password = z
  .string({ error: 'Deve ser texto.' })
  .max(PASSWORD_MAX, `A senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres.`)
  .superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

// Somente URL http(s). O servidor não baixa nem valida o conteúdo.
const avatar = z
  .string({ error: 'Deve ser texto ou null.' })
  .trim()
  .max(2048, 'URL muito longa.')
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
    } catch {
      return false;
    }
  }, 'Avatar deve ser uma URL http ou https.');

/** POST: somente estes campos; qualquer outra chave (id, displayId, tenantId, wallet, promoter...) é rejeitada. */
export const createUserSchema = z
  .strictObject({
    name,
    phone,
    document,
    birthDate,
    password,
    email: email.nullish().transform((v) => v ?? null),
    avatar: avatar.nullish().transform((v) => v ?? null),
  })
  .superRefine((data, ctx) => {
    // A senha não pode conter CPF, telefone ou data de nascimento.
    const problem = passwordProblem(data.password, data);
    if (problem) ctx.addIssue({ code: 'custom', path: ['password'], message: problem });
  });

/** PATCH: campo ausente mantém o valor; null só limpa email/avatar. Vazio é rejeitado. */
export const updateUserSchema = z
  .strictObject({
    name: name.optional(),
    phone: phone.optional(),
    document: document.optional(),
    email: email.nullable().optional(),
    avatar: avatar.nullable().optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), 'Informe ao menos um campo para atualizar.');

/** Login por CPF + senha. Mensagens genéricas: o erro de credencial é decidido no serviço. */
export const loginSchema = z.strictObject({
  document: z
    .string({ error: 'Informe o CPF.' })
    .max(32, 'CPF inválido.')
    .transform(digitsOnly)
    .pipe(z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos.')),
  password: z.string({ error: 'Informe a senha.' }).min(1, 'Informe a senha.').max(128, 'Senha inválida.'),
});

export const sessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const userIdSchema = z.uuid({ error: 'id deve ser um UUID.' });

export type CreateUserInput = z.output<typeof createUserSchema>;
export type UpdateUserInput = z.output<typeof updateUserSchema>;
export type LoginInput = z.output<typeof loginSchema>;
