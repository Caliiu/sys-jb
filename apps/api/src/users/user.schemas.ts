import { z } from 'zod';

const digitsOnly = (value: string) => value.replace(/\D/g, '');

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
  .pipe(z.string().regex(/^[1-9]{2}(?:9\d{8}|[2-8]\d{7})$/, 'Telefone deve ter DDD + número (10 ou 11 dígitos).'));

// Apenas formato (11 dígitos). Não é verificação de identidade nem de validade fiscal.
const document = z
  .string({ error: 'Deve ser texto.' })
  .max(32, 'Documento inválido.')
  .regex(/^[\d\s./-]+$/, 'Documento deve conter apenas dígitos e separadores.')
  .transform(digitsOnly)
  .pipe(z.string().regex(/^\d{11}$/, 'Documento deve ter 11 dígitos.'));

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
export const createUserSchema = z.strictObject({
  name,
  phone,
  document,
  email: email.nullish().transform((v) => v ?? null),
  avatar: avatar.nullish().transform((v) => v ?? null),
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

export const userIdSchema = z.uuid({ error: 'id deve ser um UUID.' });

export type CreateUserInput = z.output<typeof createUserSchema>;
export type UpdateUserInput = z.output<typeof updateUserSchema>;
