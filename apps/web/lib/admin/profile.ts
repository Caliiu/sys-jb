import { digitsOnly, isValidBrPhone, isValidCpf } from '@sysjb/contracts';
import { isPlausibleEmail } from '../email';

/** Campos de cadastro que o operador pode corrigir. */
export interface ProfileValues {
  name: string;
  document: string;
  phone: string;
  email: string;
}

export type ProfileField = keyof ProfileValues;
export type ProfilePatch = { name?: string; document?: string; phone?: string; email?: string | null };

/** Só o que mudou, já normalizado (CPF/telefone só dígitos, e-mail minúsculo, vazio = limpar). */
export function buildProfilePatch(
  current: { name: string; document: string; phone: string; email: string | null },
  values: ProfileValues,
): ProfilePatch {
  const patch: ProfilePatch = {};
  const name = values.name.trim();
  if (name !== current.name) patch.name = name;
  const document = digitsOnly(values.document);
  if (document !== current.document) patch.document = document;
  const phone = digitsOnly(values.phone);
  if (phone !== current.phone) patch.phone = phone;
  const email = values.email.trim().toLowerCase() || null;
  if (email !== current.email) patch.email = email;
  return patch;
}

/**
 * Feedback imediato antes de chamar a API (que continua sendo a validação oficial).
 * Valida só o que mudou: dados antigos, mesmo fora do padrão atual, não travam a edição de outro campo.
 */
export function validateProfilePatch(patch: ProfilePatch): Partial<Record<ProfileField, string>> {
  const errors: Partial<Record<ProfileField, string>> = {};
  if (patch.name !== undefined && (patch.name.length < 2 || patch.name.length > 120)) {
    errors.name = 'Informe o nome (2 a 120 caracteres).';
  }
  if (patch.document !== undefined && !isValidCpf(patch.document)) errors.document = 'CPF inválido.';
  if (patch.phone !== undefined && !isValidBrPhone(patch.phone)) errors.phone = 'Informe um telefone válido com DDD.';
  if (patch.email && !isPlausibleEmail(patch.email)) errors.email = 'E-mail inválido.';
  return errors;
}
