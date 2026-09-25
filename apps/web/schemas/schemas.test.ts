import { todayInBrazil } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { loginSchema } from './login.schema';
import { registerSchema } from './register.schema';

const valid = {
  name: 'Pessoa Sintética',
  phone: '(11) 91234-5678',
  cpf: '529.982.247-25',
  birthDate: '1990-05-17',
  password: 'frase secreta longa',
};

const firstError = (input: object) => {
  const res = registerSchema.safeParse(input);
  return res.success ? null : res.error.issues[0]?.message;
};

describe('registerSchema', () => {
  it('normaliza dados válidos para só dígitos', () => {
    const res = registerSchema.parse(valid);
    expect(res).toMatchObject({ phone: '11912345678', cpf: '52998224725', name: 'Pessoa Sintética' });
  });

  it('mostra o erro do primeiro campo inválido, na ordem do formulário', () => {
    expect(firstError({ ...valid, name: 'A', cpf: '1' })).toBe('Informe seu nome completo.');
    expect(firstError({ ...valid, phone: '(11) 1234' })).toBe('Informe um telefone válido com DDD.');
    expect(firstError({ ...valid, cpf: '529.982.247-24' })).toBe('CPF inválido.');
    expect(firstError({ ...valid, cpf: '111.111.111-11' })).toBe('CPF inválido.');
    expect(firstError({ ...valid, birthDate: '' })).toBe('Informe a data de nascimento completa (DD/MM/AAAA).');
  });

  it('exige 18 anos completos', () => {
    const [y, m, d] = todayInBrazil().split('-');
    expect(firstError({ ...valid, birthDate: `${Number(y) - 18}-${m}-${d}` })).toBeNull();
    expect(firstError({ ...valid, birthDate: `${Number(y) - 17}-${m}-${d}` })).toBe(
      'Cadastro permitido a partir de 18 anos.',
    );
  });

  it('senha: tamanho, senhas comuns e dados pessoais', () => {
    expect(firstError({ ...valid, password: 'curta' })).toMatch(/entre 8 e 128/);
    expect(firstError({ ...valid, password: '12345678' })).toBe('Senha muito comum.');
    expect(firstError({ ...valid, password: 'abc 52998224725' })).toMatch(/não pode conter CPF/);
    expect(firstError({ ...valid, password: 'nasc 17051990' })).toMatch(/não pode conter CPF/);
  });
});

describe('loginSchema', () => {
  it('pede CPF completo e senha', () => {
    expect(loginSchema.safeParse({ cpf: '', password: 'x' }).error?.issues[0]?.message).toBe('Informe seu CPF.');
    expect(loginSchema.safeParse({ cpf: '529.982', password: 'x' }).error?.issues[0]?.message).toBe(
      'Informe os 11 dígitos do CPF.',
    );
    expect(loginSchema.safeParse({ cpf: '529.982.247-25', password: '' }).error?.issues[0]?.message).toBe(
      'Informe sua senha.',
    );
    expect(loginSchema.parse({ cpf: '529.982.247-25', password: 'x' }).cpf).toBe('52998224725');
  });
});
