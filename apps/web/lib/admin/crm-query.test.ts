import { describe, expect, it } from 'vitest';
import {
  crmApiQuery,
  crmExportHref,
  crmHref,
  crmShortcutHref,
  crmSortHref,
  isCrmShortcut,
  parseCrmQuery,
} from './crm-query';

const PROMOTER = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';

describe('filtros do CRM na URL', () => {
  it('padrões de cada lista: inativos de 1 a 7 dias; nunca depositantes de 0 a 7', () => {
    expect(parseCrmQuery('inactive', {})).toEqual({
      list: 'inactive',
      minDays: 1,
      maxDays: 7,
      promoterId: '',
      sort: 'daysWithoutDeposit',
      dir: 'desc',
      page: 1,
      pageSize: 25,
    });
    expect(parseCrmQuery('never-deposited', {})).toMatchObject({ minDays: 0, maxDays: 7, sort: 'relationshipDays' });
  });

  it('faixa só vale inteira, em ordem e até 3650 dias; senão a padrão (nunca erro)', () => {
    expect(parseCrmQuery('inactive', { min: '10', max: '30' })).toMatchObject({ minDays: 10, maxDays: 30 });
    for (const raw of [
      { min: '30', max: '10' },
      { min: '-1', max: '10' },
      { min: '1.5', max: '10' },
      { min: '1', max: '3651' },
      { min: '1' },
      { min: 'abc', max: '7' },
    ]) {
      expect(parseCrmQuery('inactive', raw), JSON.stringify(raw)).toMatchObject({ minDays: 1, maxDays: 7 });
    }
  });

  it('ordem só das colunas da lista; promotor só UUID; página e tamanho tolerantes', () => {
    expect(parseCrmQuery('inactive', { ordem: 'depositado', dir: 'asc' })).toMatchObject({
      sort: 'totalDeposited',
      dir: 'asc',
    });
    // "Valor depositado" não existe em Nunca depositantes.
    expect(parseCrmQuery('never-deposited', { ordem: 'depositado' }).sort).toBe('relationshipDays');
    expect(parseCrmQuery('inactive', { ordem: '__proto__' }).sort).toBe('daysWithoutDeposit');
    expect(parseCrmQuery('inactive', { promotor: PROMOTER.toUpperCase() }).promoterId).toBe(PROMOTER);
    expect(parseCrmQuery('inactive', { promotor: "x' OR 1=1" }).promoterId).toBe('');
    expect(parseCrmQuery('inactive', { page: '0', pageSize: '7' })).toMatchObject({ page: 1, pageSize: 25 });
  });

  it('endereços: a faixa sempre vai; o resto só quando não é padrão', () => {
    const query = parseCrmQuery('inactive', { min: '1', max: '30', promotor: PROMOTER });
    expect(crmHref(query)).toBe(`/crm/inativos?min=1&max=30&promotor=${PROMOTER}`);
    expect(crmHref({ ...query, page: 2, pageSize: 50 })).toBe(
      `/crm/inativos?min=1&max=30&promotor=${PROMOTER}&pageSize=50&page=2`,
    );
    expect(crmExportHref({ ...query, page: 3 })).toBe(`/crm/inativos/exportar?min=1&max=30&promotor=${PROMOTER}`);
  });

  it('cabeçalho: mesma coluna inverte; outra começa decrescente (texto, crescente); volta à página 1', () => {
    const query = { ...parseCrmQuery('inactive', {}), page: 3 };
    expect(crmSortHref(query, 'daysWithoutDeposit')).toBe('/crm/inativos?min=1&max=7&ordem=dias-sem-depositar&dir=asc');
    expect(crmSortHref(query, 'deposits')).toBe('/crm/inativos?min=1&max=7&ordem=depositos&dir=desc');
    expect(crmSortHref(query, 'name')).toBe('/crm/inativos?min=1&max=7&ordem=nome&dir=asc');
  });

  it('atalhos de dias: até N, a partir do mínimo de cada lista', () => {
    const inactive = parseCrmQuery('inactive', {});
    expect(crmShortcutHref(inactive, 30)).toBe('/crm/inativos?min=1&max=30');
    expect(isCrmShortcut(inactive, 7)).toBe(true);
    expect(isCrmShortcut(inactive, 15)).toBe(false);
    expect(crmShortcutHref(parseCrmQuery('never-deposited', {}), 15)).toBe('/crm/nunca-depositantes?min=0&max=15');
  });

  it('formato da API', () => {
    expect(crmApiQuery(parseCrmQuery('never-deposited', { min: '3', max: '9', promotor: PROMOTER }))).toEqual({
      minDays: 3,
      maxDays: 9,
      sort: 'relationshipDays',
      dir: 'desc',
      page: 1,
      pageSize: 25,
      promoterId: PROMOTER,
    });
  });
});
