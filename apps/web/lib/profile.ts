import { digitsOnly, isValidBrPhone, passwordProblem, type PublicProfile } from '@sysjb/contracts';
import { isPlausibleEmail } from './email';

/** "43999835704" -> "(43) 9 9983 5704"; fixo "4333334444" -> "(43) 3333 4444". Outro formato volta como está. */
export function formatPhoneDisplay(phone: string): string {
  if (phone.length === 11) return `(${phone.slice(0, 2)}) ${phone[2]} ${phone.slice(3, 7)} ${phone.slice(7)}`;
  if (phone.length === 10) return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)} ${phone.slice(6)}`;
  return phone;
}

/** Nome curto do topo da tela: as duas primeiras palavras ("Carlos Eduardo da Silva" -> "Carlos Eduardo"). */
export function shortName(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).join(' ');
}

/** E-mail digitado -> valor de comparação/envio: minúsculo, sem espaços; vazio = sem e-mail (null). */
export function normalizeEmail(value: string): string | null {
  return value.trim().toLowerCase() || null;
}

/** O que o usuário pode alterar no perfil: e-mail e telefone (CPF e nascimento são só leitura). */
export interface ProfileChanges {
  email?: string | null;
  phone?: string;
}

/** Só o que mudou em relação ao perfil salvo, já normalizado (telefone só dígitos). */
export function profileChanges(
  saved: Pick<PublicProfile, 'email' | 'phone'>,
  values: { email: string; phone: string },
): ProfileChanges {
  const changes: ProfileChanges = {};
  const email = normalizeEmail(values.email);
  if (email !== saved.email) changes.email = email;
  const phone = digitsOnly(values.phone);
  if (phone !== saved.phone) changes.phone = phone;
  return changes;
}

/** Feedback imediato (a API continua sendo a validação oficial). Valida só o que mudou. */
export function validateProfileChanges(changes: ProfileChanges): { email?: string; phone?: string } {
  const errors: { email?: string; phone?: string } = {};
  if (changes.email && !isPlausibleEmail(changes.email)) errors.email = 'Informe um e-mail válido.';
  if (changes.phone !== undefined && !isValidBrPhone(changes.phone))
    errors.phone = 'Informe um telefone válido com DDD.';
  return errors;
}

/**
 * Regras da senha nova (as mesmas do cadastro): tamanho, senha comum e não conter CPF, telefone ou
 * data de nascimento. `phone` é o que ficará salvo (o novo, se o telefone também mudou).
 */
export function newPasswordProblem(
  password: string,
  personal: { document: string; phone: string; birthDate: string },
): string | null {
  return passwordProblem(password, personal);
}
