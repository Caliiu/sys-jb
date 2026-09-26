import { describe, expect, it } from 'vitest';
import { buildProfilePatch, validateProfilePatch } from './profile';

const current = { name: 'Ana Souza', document: '52998224725', phone: '11912345678', email: null as string | null };
const same = { name: 'Ana Souza', document: '529.982.247-25', phone: '(11) 91234-5678', email: '' };

describe('buildProfilePatch', () => {
  it('sem alteração (mesmo com máscara e espaços), o patch é vazio', () => {
    expect(buildProfilePatch(current, same)).toEqual({});
    expect(buildProfilePatch(current, { ...same, name: '  Ana Souza  ' })).toEqual({});
  });

  it('envia só o que mudou, normalizado', () => {
    expect(buildProfilePatch(current, { ...same, name: ' Ana Lima ', phone: '(21) 3333-4444' })).toEqual({
      name: 'Ana Lima',
      phone: '2133334444',
    });
    expect(buildProfilePatch(current, { ...same, document: '111.444.777-35' })).toEqual({ document: '11144477735' });
  });

  it('e-mail: minúsculo; vazio limpa (null); igual ao atual não é enviado', () => {
    expect(buildProfilePatch(current, { ...same, email: ' Ana@Example.Test ' })).toEqual({ email: 'ana@example.test' });
    expect(buildProfilePatch({ ...current, email: 'a@example.test' }, { ...same, email: '' })).toEqual({ email: null });
    expect(buildProfilePatch({ ...current, email: 'a@example.test' }, { ...same, email: 'A@example.test' })).toEqual(
      {},
    );
  });
});

describe('validateProfilePatch', () => {
  it('sem campos alterados, sem erros (dados antigos não travam a edição de outro campo)', () => {
    expect(validateProfilePatch({})).toEqual({});
  });

  it('valida só o que mudou', () => {
    expect(validateProfilePatch({ name: 'A' })).toEqual({ name: 'Informe o nome (2 a 120 caracteres).' });
    expect(validateProfilePatch({ document: '11111111111' })).toEqual({ document: 'CPF inválido.' });
    expect(validateProfilePatch({ phone: '123' })).toEqual({ phone: 'Informe um telefone válido com DDD.' });
    expect(validateProfilePatch({ email: 'sem-arroba' })).toEqual({ email: 'E-mail inválido.' });
  });

  it('aceita dados válidos e limpar o e-mail', () => {
    expect(
      validateProfilePatch({ name: 'Ana Lima', document: '52998224725', phone: '11912345678', email: 'a@b.co' }),
    ).toEqual({});
    expect(validateProfilePatch({ email: null })).toEqual({});
  });
});
