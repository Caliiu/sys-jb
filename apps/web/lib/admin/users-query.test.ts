import { describe, expect, it } from 'vitest';
import { parseUsersQuery, usersExportHref, usersHref } from './users-query';

const PROMOTER = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';

describe('parseUsersQuery', () => {
  it('lê página, tamanho, busca, status e promotor válidos', () => {
    expect(
      parseUsersQuery({ page: '3', pageSize: '50', search: '  ana ', status: 'BLOCKED', promoterId: PROMOTER }),
    ).toEqual({ page: 3, pageSize: 50, search: 'ana', status: 'BLOCKED', promoterId: PROMOTER });
  });

  it('valor inválido ou ausente vira o padrão (a URL é digitável, nunca dá erro)', () => {
    expect(parseUsersQuery({})).toEqual({ page: 1, pageSize: 25, search: '', status: '', promoterId: '' });
    for (const pageSize of ['0', '20', '101', 'abc']) {
      expect(parseUsersQuery({ pageSize }).pageSize, pageSize).toBe(25);
    }
    expect(parseUsersQuery({ promoterId: 'nao-e-uuid' }).promoterId).toBe('');
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
    expect(usersHref({})).toBe('/usuarios');
    expect(usersHref({ page: 1, pageSize: 25, search: '', status: '', promoterId: '' })).toBe('/usuarios');
  });

  it('monta a query com codificação segura', () => {
    expect(usersHref({ page: 2, pageSize: 10, search: 'ana & cia', status: 'ACTIVE', promoterId: PROMOTER })).toBe(
      `/usuarios?search=ana+%26+cia&status=ACTIVE&promoterId=${PROMOTER}&pageSize=10&page=2`,
    );
  });

  it('é o inverso de parseUsersQuery', () => {
    const query = { page: 4, pageSize: 100, search: 'joão 100%', status: 'BLOCKED' as const, promoterId: PROMOTER };
    const params = new URL(usersHref(query), 'http://x').searchParams;
    expect(parseUsersQuery(Object.fromEntries(params))).toEqual(query);
  });

  it('exportar leva os filtros, sem página nem tamanho', () => {
    expect(usersExportHref({ page: 3, pageSize: 50, search: 'ana', status: 'ACTIVE', promoterId: '' })).toBe(
      '/usuarios/exportar?search=ana&status=ACTIVE',
    );
    expect(usersExportHref({})).toBe('/usuarios/exportar');
  });
});
