import { INVITE_CODE_PATTERN, parseInviteRef } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';

describe('código de convite', () => {
  it('aceita o código de 5 caracteres em qualquer caixa (normaliza para maiúsculas)', () => {
    expect(parseInviteRef('CDYGE')).toEqual({ code: 'CDYGE' });
    expect(parseInviteRef('cdyge')).toEqual({ code: 'CDYGE' });
    expect(parseInviteRef(' P5R3M ')).toEqual({ code: 'P5R3M' });
  });

  it('links antigos com o ID exibido continuam valendo', () => {
    expect(parseInviteRef('100008')).toEqual({ displayId: 100008 });
  });

  it('recusa ambíguos (O, 0, I, 1), tamanho errado e ID fora do int4', () => {
    for (const bad of ['ABCD0', 'ABCDO', 'ABCD1', 'ABCDI', 'ABCD', 'ABCDEF', '12345', '', 'AB-CD', '2147483648']) {
      expect(parseInviteRef(bad), bad).toBeNull();
    }
    expect(INVITE_CODE_PATTERN.test('CDYGE')).toBe(true);
  });
});
