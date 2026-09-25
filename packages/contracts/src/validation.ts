/**
 * Regras de cadastro compartilhadas entre a API (validação oficial) e o web (feedback imediato).
 * Funções puras, sem dependências.
 */

export const MIN_AGE = 18;
export const MAX_AGE = 120;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const digitsOnly = (value: string): string => value.replace(/\D/g, '');

/** Dígitos verificadores do CPF (entrada só com dígitos). Só formato: não verifica identidade. */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const d = digits.split('').map(Number);
  const check = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += d[i]! * (length + 1 - i);
    return ((sum * 10) % 11) % 10;
  };
  return check(9) === d[9] && check(10) === d[10];
}

/** Telefone nacional: DDD + 8 dígitos (fixo) ou DDD + 9 + 8 dígitos (celular). */
export function isValidBrPhone(digits: string): boolean {
  return /^[1-9]{2}(?:9\d{8}|[2-8]\d{7})$/.test(digits);
}

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília. */
export function todayInBrazil(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** true se `isoDate` (YYYY-MM-DD) é uma data de calendário real. */
export function isRealDate(isoDate: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Idade completa em anos. Quem nasceu em 29/02 completa aniversário em 01/03 nos anos não bissextos. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Mensagem do problema com a data de nascimento (YYYY-MM-DD), ou null se válida. */
export function birthDateProblem(isoDate: string, today: string = todayInBrazil()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return 'Use o formato de data completo.';
  if (!isRealDate(isoDate)) return 'Data de nascimento inexistente.';
  if (isoDate > today) return 'Data de nascimento no futuro.';
  const age = ageOn(isoDate, today);
  if (age < MIN_AGE) return `Cadastro permitido a partir de ${MIN_AGE} anos.`;
  if (age > MAX_AGE) return 'Data de nascimento inválida.';
  return null;
}

const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  '11111111',
  '00000000',
  'password',
  'senha123',
  'qwerty123',
  'abcd1234',
]);

/**
 * Mensagem do problema com a senha, ou null se aceitável. Sem regras de composição
 * (NIST SP 800-63B): comprimento, senhas óbvias e dados pessoais.
 */
export function passwordProblem(
  password: string,
  personal: { document?: string; phone?: string; birthDate?: string } = {},
): string | null {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `A senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres.`;
  }
  if (password.trim().length === 0) return 'A senha não pode ser só espaços.';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'Senha muito comum.';

  const pwDigits = digitsOnly(password);
  const forbidden: string[] = [];
  if (personal.document) forbidden.push(personal.document);
  if (personal.phone) forbidden.push(personal.phone);
  if (personal.birthDate && isRealDate(personal.birthDate)) {
    const [y, m, d] = personal.birthDate.split('-');
    forbidden.push(`${y}${m}${d}`, `${d}${m}${y}`);
  }
  if (forbidden.some((p) => p.length > 0 && pwDigits.includes(p))) {
    return 'A senha não pode conter CPF, telefone ou data de nascimento.';
  }
  return null;
}
