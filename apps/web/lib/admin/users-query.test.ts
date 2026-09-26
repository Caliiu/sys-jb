import { describe, expect, it } from 'vitest';
import { parseUsersQuery, usersHref } from './users-query';

describe('parseUsersQuery', () => {
  it('lê página, busca e status válidos', () => {
    expect(parseUsersQuery({ page: '3', search: '  ana ', status: 'BLOCKED' })).toEqual({
      page: 3,
      search: 'ana',
      status: 'BLOCKED',
    });
  });

  it('valor inválido ou ausente vira o padrão (a URL é digitável, nunca dá erro)', () => {
    expect(parseUsersQuery({})).toEqual({ page: 1, search: '', status: '' });
    for (const page of ['0', '-2', '1.5', 'abc', '', '1000001']) {
      expect(parseUsersQuery({ page }).page, page).toBe(1);
    }
    expect(parseUsersQuery({ status: 'OUTRO' }).status).toBe('');
    expect(parseUsersQuery({ status: 'active' }).status).toBe('');
  });

  it('usa o primeiro valor quando o parâmetro se repete e limita o tamanho da busca', () => {
    expect(parseUsersQuery({ page: ['2', '5'], search: ['a', 'b'] })).toMatchObject({ page: 2, search: 'a' });
    expect(parseUsersQuery({ search: 'x'.repeat(500) }).search).toHaveLength(100);
  });
});

describe('usersHref', () => {
  it('omite o que é padrão', () => {
    expect(usersHref({})).toBe('/admin/usuarios');
    expect(usersHref({ page: 1, search: '', status: '' })).toBe('/admin/usuarios');
  });

  it('monta a query com codificação segura', () => {
    expect(usersHref({ page: 2, search: 'ana & cia', status: 'ACTIVE' })).toBe(
      '/admin/usuarios?search=ana+%26+cia&status=ACTIVE&page=2',
    );
  });

  it('é o inverso de parseUsersQuery', () => {
    const query = { page: 4, search: 'joão 100%', status: 'BLOCKED' as const };
    const params = new URL(usersHref(query), 'http://x').searchParams;
    expect(
      parseUsersQuery({
        page: params.get('page') ?? undefined,
        search: params.get('search') ?? undefined,
        status: params.get('status') ?? undefined,
      }),
    ).toEqual(query);
  });
});
