import { describe, expect, it } from 'vitest';
import { parseTicketsQuery, ticketsHref } from './tickets-query';

// 30/09/2026 12:00 em Brasília.
const NOW = '2026-09-30T15:00:00.000Z';
const ID = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';

describe('bilhetes: filtros da URL', () => {
  it('sem nada na URL: não pesquisou, data de hoje e o resto padrão', () => {
    expect(parseTicketsQuery({}, NOW)).toEqual({
      searched: false,
      date: '2026-09-30',
      page: 1,
      pageSize: 25,
      promoterId: '',
      userId: '',
      drawId: '',
      ticket: null,
    });
  });

  it('lê data, filtros, página e tamanho válidos (ids em minúsculas)', () => {
    expect(
      parseTicketsQuery(
        { data: '2026-09-28', promotor: ID.toUpperCase(), apostador: ID, extracao: ID, page: '2', pageSize: '50' },
        NOW,
      ),
    ).toEqual({
      searched: true,
      date: '2026-09-28',
      page: 2,
      pageSize: 50,
      promoterId: ID,
      userId: ID,
      drawId: ID,
      ticket: null,
    });
  });

  it('data inválida, futura ou antiga demais volta para hoje (e não conta como pesquisa)', () => {
    for (const data of ['2026-02-30', '2026-10-01', '1999-12-31', 'hoje', '']) {
      expect(parseTicketsQuery({ data }, NOW), data).toMatchObject({ searched: false, date: '2026-09-30' });
    }
  });

  it('ticket: só número positivo dentro do limite; conta como pesquisa', () => {
    expect(parseTicketsQuery({ ticket: ' 10001 ' }, NOW)).toMatchObject({ searched: true, ticket: 10001 });
    for (const ticket of ['0', '-1', 'abc', '1.5', '99999999999', '2147483648']) {
      expect(parseTicketsQuery({ ticket }, NOW).ticket, ticket).toBeNull();
    }
  });

  it('ids inválidos são ignorados', () => {
    expect(parseTicketsQuery({ data: '2026-09-30', apostador: '123', promotor: 'x' }, NOW)).toMatchObject({
      userId: '',
      promoterId: '',
    });
  });

  it('endereço: a data sempre vai; o resto só quando não é padrão', () => {
    expect(ticketsHref({ date: '2026-09-30' })).toBe('/bilhetes?data=2026-09-30');
    expect(ticketsHref({ date: '2026-09-30', promoterId: ID, userId: ID, drawId: ID, pageSize: 50, page: 3 })).toBe(
      `/bilhetes?data=2026-09-30&promotor=${ID}&apostador=${ID}&extracao=${ID}&pageSize=50&page=3`,
    );
  });

  it('é o inverso de parseTicketsQuery', () => {
    const query = parseTicketsQuery({ data: '2026-09-29', apostador: ID, page: '4', pageSize: '10' }, NOW);
    const params = new URL(ticketsHref(query), 'http://x').searchParams;
    expect(parseTicketsQuery(Object.fromEntries(params), NOW)).toEqual(query);
  });
});
