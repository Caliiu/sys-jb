import { digitsOnly, isValidBrPhone } from '@sysjb/contracts';
import { isPlausibleEmail } from './email';
import { maskCpfInput, maskPhoneInput } from './masks';

export const PIX_KEY_TYPES = ['cpf', 'email', 'phone', 'random'] as const;
export type PixKeyType = (typeof PIX_KEY_TYPES)[number];

interface PixKeyTypeInfo {
  /** Nome curto no seletor. */
  label: string;
  /** Rótulo do campo ("Chave CPF"). */
  fieldLabel: string;
  placeholder: string;
}

export const PIX_KEY_INFO: Readonly<Record<PixKeyType, PixKeyTypeInfo>> = {
  cpf: { label: 'CPF', fieldLabel: 'Chave CPF', placeholder: '000.000.000-00' },
  email: { label: 'E-mail', fieldLabel: 'Chave e-mail', placeholder: 'voce@exemplo.com' },
  phone: { label: 'Celular', fieldLabel: 'Chave celular', placeholder: '(00) 00000-0000' },
  random: { label: 'Aleatória', fieldLabel: 'Chave aleatória', placeholder: 'Cole sua chave aleatória' },
};

/** E-mail como chave Pix tem no máximo 77 caracteres (regra do Banco Central). */
const EMAIL_MAX = 77;
const RANDOM_KEY_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Forma normalizada da chave: CPF e celular só dígitos; e-mail e aleatória em minúsculas e sem espaços nas pontas. */
export function normalizePixKey(type: PixKeyType, value: string): string {
  return type === 'cpf' || type === 'phone' ? digitsOnly(value) : value.trim().toLowerCase();
}

/** Como a chave (normalizada) aparece nas telas: CPF em dígitos, celular com máscara, o resto como está. */
export function pixKeyDisplay(type: PixKeyType, value: string): string {
  return type === 'phone' ? maskPhoneInput(value) : value;
}

/** Valor inicial do campo ao escolher o tipo: a chave CPF é sempre a do titular; as demais começam vazias. */
export function initialPixKey(type: PixKeyType, holderDocument: string): string {
  return type === 'cpf' ? maskCpfInput(holderDocument) : '';
}

/** Máscara de digitação de cada tipo (a chave CPF não é editável: sempre a do titular). */
export function formatPixKeyInput(type: PixKeyType, raw: string, holderDocument: string): string {
  switch (type) {
    case 'cpf':
      return maskCpfInput(holderDocument);
    case 'phone':
      return maskPhoneInput(raw);
    case 'random':
      return raw
        .toLowerCase()
        .replace(/[^0-9a-f-]/g, '')
        .slice(0, 36);
    case 'email':
      return raw.slice(0, EMAIL_MAX + 1);
  }
}

/** Mensagem do problema com a chave, ou null se está pronta. */
export function pixKeyProblem(type: PixKeyType, value: string, holderDocument: string): string | null {
  switch (type) {
    case 'cpf':
      return digitsOnly(value) === holderDocument ? null : 'A chave CPF deve ser a do titular da conta.';
    case 'email': {
      const email = value.trim();
      return email.length <= EMAIL_MAX && isPlausibleEmail(email) ? null : 'Informe um e-mail válido.';
    }
    case 'phone': {
      const phone = digitsOnly(value);
      return phone.length === 11 && isValidBrPhone(phone) ? null : 'Informe um celular válido com DDD.';
    }
    case 'random':
      return RANDOM_KEY_FORMAT.test(value) ? null : 'Informe a chave aleatória completa (36 caracteres).';
  }
}
