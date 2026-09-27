import { describe, expect, it } from 'vitest';
import {
  formatPhoneDisplay,
  newPasswordProblem,
  normalizeEmail,
  profileChanges,
  shortName,
  validateProfileChanges,
} from './profile';

describe('formatPhoneDisplay', () => {
  it('celular e fixo no formato do design', () => {
    expect(formatPhoneDisplay('43999835704')).toBe('(43) 9 9983 5704');
    expect(formatPhoneDisplay('4333334444')).toBe('(43) 3333 4444');
  });

  it('formato inesperado volta como está (nunca quebra)', () => {
    expect(formatPhoneDisplay('123')).toBe('123');
    expect(formatPhoneDisplay('')).toBe('');
  });
});

describe('shortName', () => {
  it('as duas primeiras palavras', () => {
    expect(shortName('Carlos Eduardo da Silva')).toBe('Carlos Eduardo');
    expect(shortName('  Ana   Souza  ')).toBe('Ana Souza');
    expect(shortName('Madonna')).toBe('Madonna');
    expect(shortName('')).toBe('');
  });
});

describe('normalizeEmail', () => {
  it('minúsculo e sem espaços; vazio vira null', () => {
    expect(normalizeEmail(' Ana@Example.COM ')).toBe('ana@example.com');
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
  });
});

describe('profileChanges', () => {
  const saved = { email: 'ana@example.com' as string | null, phone: '11912345678' };

  it('sem alteração (mesmo com máscara e caixa diferentes), nada muda', () => {
    expect(profileChanges(saved, { email: ' ANA@example.com ', phone: '(11) 91234-5678' })).toEqual({});
  });

  it('envia só o que mudou, normalizado', () => {
    expect(profileChanges(saved, { email: 'ana@example.com', phone: '(21) 98765-4321' })).toEqual({
      phone: '21987654321',
    });
    expect(profileChanges(saved, { email: 'Outra@Example.com', phone: '(11) 91234-5678' })).toEqual({
      email: 'outra@example.com',
    });
  });

  it('limpar o e-mail envia null; sem e-mail salvo e campo vazio não muda nada', () => {
    expect(profileChanges(saved, { email: '', phone: '(11) 91234-5678' })).toEqual({ email: null });
    expect(profileChanges({ ...saved, email: null }, { email: '  ', phone: '(11) 91234-5678' })).toEqual({});
  });
});

describe('validateProfileChanges', () => {
  it('sem mudanças, sem erros (dados antigos não travam)', () => {
    expect(validateProfileChanges({})).toEqual({});
  });

  it('e-mail e telefone válidos passam; limpar o e-mail também', () => {
    expect(validateProfileChanges({ email: 'a@b.co', phone: '11912345678' })).toEqual({});
    expect(validateProfileChanges({ email: null })).toEqual({});
  });

  it('aponta o campo com problema', () => {
    expect(validateProfileChanges({ email: 'sem-arroba' })).toEqual({ email: 'Informe um e-mail válido.' });
    expect(validateProfileChanges({ phone: '123' })).toEqual({ phone: 'Informe um telefone válido com DDD.' });
    expect(validateProfileChanges({ phone: '', email: 'x' })).toEqual({
      phone: 'Informe um telefone válido com DDD.',
      email: 'Informe um e-mail válido.',
    });
  });
});

describe('newPasswordProblem', () => {
  const personal = { document: '52998224725', phone: '11912345678', birthDate: '1990-05-17' };

  it('aceita uma senha boa', () => {
    expect(newPasswordProblem('uma frase totalmente nova 2026', personal)).toBeNull();
  });

  it('recusa curta, comum e com dados pessoais (as mesmas regras do cadastro)', () => {
    expect(newPasswordProblem('abc123', personal)).toMatch(/entre 8 e 128/);
    expect(newPasswordProblem('senha123', personal)).toBe('Senha muito comum.');
    for (const password of ['meu cpf 52998224725 aqui', 'fone 11912345678 fone', 'nasci em 17051990 mesmo']) {
      expect(newPasswordProblem(password, personal), password).toBe(
        'A senha não pode conter CPF, telefone ou data de nascimento.',
      );
    }
  });
});
