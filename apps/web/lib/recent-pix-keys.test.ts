import { describe, expect, it } from 'vitest';
import {
  MAX_RECENT_PIX_KEYS,
  normalizeRecentKey,
  parseRecentKeys,
  type RecentPixKey,
  recentKeyFieldValue,
  recentKeyLabel,
  recentKeysStorageKey,
  rememberKey,
} from './recent-pix-keys';

const DOC = '52998224725';
const RANDOM = '123e4567-e89b-42d3-a456-426614174000';

describe('normalizeRecentKey', () => {
  it('CPF e celular viram só dígitos; e-mail e aleatória, minúsculas sem espaços nas pontas', () => {
    expect(normalizeRecentKey('cpf', '529.982.247-25')).toEqual({ type: 'cpf', value: DOC });
    expect(normalizeRecentKey('phone', '(11) 91234-5678')).toEqual({ type: 'phone', value: '11912345678' });
    expect(normalizeRecentKey('email', ' Ana@Example.COM ')).toEqual({ type: 'email', value: 'ana@example.com' });
    expect(normalizeRecentKey('random', RANDOM.toUpperCase())).toEqual({ type: 'random', value: RANDOM });
  });
});

describe('rememberKey', () => {
  const key = (n: number): RecentPixKey => ({ type: 'email', value: `pessoa${n}@example.com` });

  it('a mais recente vai para o topo, sem repetir', () => {
    const list = rememberKey(rememberKey([], key(1)), key(2));
    expect(list).toEqual([key(2), key(1)]);
    expect(rememberKey(list, key(1))).toEqual([key(1), key(2)]);
  });

  it('mesmo valor em tipos diferentes são chaves diferentes', () => {
    const list = rememberKey([{ type: 'cpf', value: DOC }], { type: 'random', value: DOC });
    expect(list).toHaveLength(2);
  });

  it('guarda só as mais recentes', () => {
    let list: RecentPixKey[] = [];
    for (let n = 1; n <= MAX_RECENT_PIX_KEYS + 3; n += 1) list = rememberKey(list, key(n));
    expect(list).toHaveLength(MAX_RECENT_PIX_KEYS);
    expect(list[0]).toEqual(key(MAX_RECENT_PIX_KEYS + 3));
    expect(list).not.toContainEqual(key(1));
  });

  it('não altera a lista original', () => {
    const original: RecentPixKey[] = [key(1)];
    rememberKey(original, key(2));
    expect(original).toEqual([key(1)]);
  });
});

describe('parseRecentKeys', () => {
  it('lê o que foi guardado', () => {
    const raw = JSON.stringify([
      { type: 'cpf', value: DOC },
      { type: 'email', value: 'ana@example.com' },
      { type: 'phone', value: '11912345678' },
      { type: 'random', value: RANDOM },
    ]);
    expect(parseRecentKeys(raw, DOC)).toHaveLength(4);
  });

  it('vazio, texto inválido ou formato errado viram lista vazia (nunca erro)', () => {
    for (const raw of [null, '', 'lixo', '{}', '"texto"', '123', 'null']) {
      expect(parseRecentKeys(raw, DOC), String(raw)).toEqual([]);
    }
  });

  it('descarta entradas adulteradas ou inválidas e mantém as boas', () => {
    const raw = JSON.stringify([
      null,
      'texto',
      { type: 'cpf' },
      { value: 'x' },
      { type: 'outro', value: 'a' },
      { type: 'cpf', value: '11144477735' }, // CPF que não é o do titular
      { type: 'email', value: 'sem-arroba' },
      { type: 'phone', value: '123' },
      { type: 'random', value: 'curta' },
      { type: 'email', value: 123 },
      { type: 'email', value: 'ana@example.com' },
    ]);
    expect(parseRecentKeys(raw, DOC)).toEqual([{ type: 'email', value: 'ana@example.com' }]);
  });

  it('respeita o limite mesmo se o armazenamento tiver mais', () => {
    const many = Array.from({ length: 20 }, (_, n) => ({ type: 'email', value: `p${n}@example.com` }));
    expect(parseRecentKeys(JSON.stringify(many), DOC)).toHaveLength(MAX_RECENT_PIX_KEYS);
  });
});

describe('exibição', () => {
  it('rótulo do botão: CPF em dígitos (como no design), celular com máscara', () => {
    expect(recentKeyLabel({ type: 'cpf', value: DOC })).toBe(DOC);
    expect(recentKeyLabel({ type: 'phone', value: '11912345678' })).toBe('(11) 91234-5678');
    expect(recentKeyLabel({ type: 'email', value: 'ana@example.com' })).toBe('ana@example.com');
  });

  it('valor do campo ao escolher uma recente usa a máscara de cada tipo', () => {
    expect(recentKeyFieldValue({ type: 'cpf', value: DOC })).toBe('529.982.247-25');
    expect(recentKeyFieldValue({ type: 'phone', value: '11912345678' })).toBe('(11) 91234-5678');
    expect(recentKeyFieldValue({ type: 'random', value: RANDOM })).toBe(RANDOM);
  });

  it('a chave de armazenamento é por usuário', () => {
    expect(recentKeysStorageKey('a')).not.toBe(recentKeysStorageKey('b'));
  });
});
