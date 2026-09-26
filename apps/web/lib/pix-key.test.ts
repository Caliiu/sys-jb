import { describe, expect, it } from 'vitest';
import {
  formatPixKeyInput,
  initialPixKey,
  normalizePixKey,
  PIX_KEY_TYPES,
  pixKeyDisplay,
  pixKeyProblem,
} from './pix-key';

const DOC = '52998224725';
const RANDOM = '123e4567-e89b-42d3-a456-426614174000';

describe('initialPixKey', () => {
  it('a chave CPF já vem com o CPF do titular; as demais começam vazias', () => {
    expect(initialPixKey('cpf', DOC)).toBe('529.982.247-25');
    for (const type of ['email', 'phone', 'random'] as const) expect(initialPixKey(type, DOC)).toBe('');
  });
});

describe('formatPixKeyInput', () => {
  it('CPF não é editável: qualquer digitação volta ao CPF do titular', () => {
    expect(formatPixKeyInput('cpf', '111', DOC)).toBe('529.982.247-25');
  });

  it('celular ganha máscara progressiva', () => {
    expect(formatPixKeyInput('phone', '11912345678', DOC)).toBe('(11) 91234-5678');
  });

  it('chave aleatória: minúsculas, só hexadecimal e hífen, até 36 caracteres', () => {
    expect(formatPixKeyInput('random', '123E4567-Xyz', DOC)).toBe('123e4567-');
    expect(formatPixKeyInput('random', `${RANDOM}abc`, DOC)).toHaveLength(36);
  });

  it('e-mail é livre, com limite de tamanho', () => {
    expect(formatPixKeyInput('email', 'Ana@Example.com', DOC)).toBe('Ana@Example.com');
    expect(formatPixKeyInput('email', 'a'.repeat(200), DOC)).toHaveLength(78);
  });
});

describe('pixKeyProblem', () => {
  it('CPF: só a chave do próprio titular', () => {
    expect(pixKeyProblem('cpf', '529.982.247-25', DOC)).toBeNull();
    expect(pixKeyProblem('cpf', '111.444.777-35', DOC)).toBe('A chave CPF deve ser a do titular da conta.');
    expect(pixKeyProblem('cpf', '', DOC)).not.toBeNull();
  });

  it('e-mail: formato válido e até 77 caracteres', () => {
    expect(pixKeyProblem('email', ' ana@example.com ', DOC)).toBeNull();
    for (const bad of ['', 'ana', 'ana@', '@example.com', 'ana@example', 'a na@example.com']) {
      expect(pixKeyProblem('email', bad, DOC), bad).toBe('Informe um e-mail válido.');
    }
    expect(pixKeyProblem('email', `${'a'.repeat(70)}@example.com`, DOC)).not.toBeNull();
  });

  it('celular: 11 dígitos com DDD e nono dígito', () => {
    expect(pixKeyProblem('phone', '(11) 91234-5678', DOC)).toBeNull();
    for (const bad of ['', '(11) 1234-5678', '(11) 3333-4444', '(01) 91234-5678', '(11) 91234-567']) {
      expect(pixKeyProblem('phone', bad, DOC), bad).toBe('Informe um celular válido com DDD.');
    }
  });

  it('aleatória: UUID completo (8-4-4-4-12)', () => {
    expect(pixKeyProblem('random', RANDOM, DOC)).toBeNull();
    for (const bad of ['', RANDOM.slice(0, 35), RANDOM.toUpperCase(), RANDOM.replace(/-/g, ''), `${RANDOM}0`]) {
      expect(pixKeyProblem('random', bad, DOC), bad).toBe('Informe a chave aleatória completa (36 caracteres).');
    }
  });

  it('há regra para todos os tipos', () => {
    expect(PIX_KEY_TYPES).toEqual(['cpf', 'email', 'phone', 'random']);
  });
});

describe('normalizePixKey e pixKeyDisplay', () => {
  it('normaliza cada tipo', () => {
    expect(normalizePixKey('cpf', '529.982.247-25')).toBe(DOC);
    expect(normalizePixKey('phone', '(11) 91234-5678')).toBe('11912345678');
    expect(normalizePixKey('email', ' Ana@Example.COM ')).toBe('ana@example.com');
    expect(normalizePixKey('random', RANDOM.toUpperCase())).toBe(RANDOM);
  });

  it('exibição: CPF em dígitos, celular com máscara, o resto como está', () => {
    expect(pixKeyDisplay('cpf', DOC)).toBe(DOC);
    expect(pixKeyDisplay('phone', '11912345678')).toBe('(11) 91234-5678');
    expect(pixKeyDisplay('email', 'ana@example.com')).toBe('ana@example.com');
    expect(pixKeyDisplay('random', RANDOM)).toBe(RANDOM);
  });
});
